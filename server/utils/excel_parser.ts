import * as XLSX from "xlsx";
import { type ParsedProject, type ParsedExcelData, type RowWarning } from "../excel-parser";

export type { ParsedProject, ParsedExcelData, RowWarning };

/**
 * REWRITTEN EXCEL PARSER (STRICT MODE)
 * 
 * Logic:
 * 1. Skip rows 1-3 (Garbage headers/metadata).
 * 2. Row 4 (Index 3) = Header Row.
 * 3. Row 5 (Index 4) = Data Start.
 * 4. STRICT Mapping based on Row 4 headers.
 */

export function parseExcelBuffer(buffer: Buffer, versionId: number): ParsedExcelData {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const advertencias: RowWarning[] = [];
    const projects: ParsedProject[] = [];

    // Find "Proyectos PGP" sheet
    let sheetName: string | null = null;
    for (const name of workbook.SheetNames) {
        if (name.toLowerCase().trim() === "proyectos pgp") {
            sheetName = name;
            break;
        }
    }

    if (!sheetName) {
        sheetName = workbook.SheetNames[0];
        console.log(`[Excel Parser] Sheet "Proyectos PGP" not found, using "${sheetName}"`);
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        defval: null,
        blankrows: false
    });

    /**
     * DYNAMIC HEADER DETECTION
     * Scan first 30 rows to find the one with the most recognizable columns.
     */
    let headerRowIndex = -1;
    let maxMatches = 0;
    const recognizedHeaders = ["iniciativa", "nombre", "proyecto", "id power steering", "id ps", "status", "estatus", "total valor", "total esfuerzo"];

    for (let i = 0; i < Math.min(30, rows.length); i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row)) continue;

        let matches = 0;
        row.forEach((cell: any) => {
            if (!cell) return;
            const normalized = String(cell).toLowerCase().trim();
            if (recognizedHeaders.some(h => normalized.includes(h))) {
                matches++;
            }
        });

        if (matches > maxMatches) {
            maxMatches = matches;
            headerRowIndex = i;
        }

        // If we found a row with at least 3 strong matches, it's likely our header
        if (matches >= 4) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        throw new Error("No se pudo detectar el encabezado del archivo. Asegúrese de que existe una fila con columnas como 'Iniciativa', 'Status' e 'ID Power Steering'.");
    }

    const headerRow = rows[headerRowIndex];
    const dataRows = rows.slice(headerRowIndex + 1);

    console.log(`[Excel Parser] Header detected at Row ${headerRowIndex + 1}: ${JSON.stringify(headerRow.slice(0, 10))}`);

    // Mapping logic - DO IT ONCE OUTSIDE THE LOOP
    const colIndex: Record<string, number> = {};
    headerRow.forEach((h, idx) => {
        if (h) {
            // Strong normalization: lowercase, trim, and remove special characters for better matching
            const normalized = String(h).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            colIndex[normalized] = idx;
        }
    });

    // Helper to find column by multiple possible names (flexible matching)
    const getIdx = (aliases: string[]) => {
        const normalizedAliases = aliases.map(a => a.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));

        // 1. Try exact match first
        for (const alias of normalizedAliases) {
            if (colIndex[alias] !== undefined) return colIndex[alias];
        }

        // 2. Try partial match as fallback
        for (const [colName, idx] of Object.entries(colIndex)) {
            for (const alias of normalizedAliases) {
                if (colName.includes(alias) || alias.includes(colName)) {
                    console.log(`[Excel Parser] Found partial match: "${colName}" for alias "${alias}"`);
                    return idx;
                }
            }
        }
        return undefined;
    };

    const initiativeAliases = ["iniciativa", "nombre", "proyecto", "nombre del proyecto", "project name"];
    const idAliases = ["id power steering", "id ps", "id", "código", "codigo", "card id devops"];
    const descAliases = ["descripción", "descripcion", "details", "detalle"];
    const statusAliases = ["status", "estatus", "fase", "estado"];
    const valorAliases = ["total valor", "valor", "value", "impacto"];
    const esfuerzoAliases = ["total esfuerzo", "esfuerzo", "effort"];

    const initiativeIdx = getIdx(initiativeAliases);
    const idIdx = getIdx(idAliases);
    const descIdx = getIdx(descAliases);
    const statusIdx = getIdx(statusAliases);
    const valorIdx = getIdx(valorAliases);
    const esfuerzoIdx = getIdx(esfuerzoAliases);

    console.log(`[Excel Parser] Indices detected: initiative=${initiativeIdx}, id=${idIdx}, status=${statusIdx}`);

    if (initiativeIdx === undefined) {
        throw new Error("No se pudo encontrar la columna de 'Iniciativa' o 'Nombre del Proyecto'.");
    }

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || !Array.isArray(row)) continue;

        const initiative = row[initiativeIdx];
        // Skip empty rows or rows where iniciativa is missing
        if (!initiative || String(initiative).trim() === "" || String(initiative).toLowerCase().includes("weighting")) continue;

        // Extract ID - ENSURE IT IS FRESH FOR EVERY ROW
        let extractedId: string | null = null;
        if (idIdx !== undefined) {
            extractedId = getString(row[idIdx]);
        }

        // Trace logging for first few rows or the problematic ID
        if (i < 5 || extractedId === "AM03473") {
            console.log(`[Parser] Row ${i + headerRowIndex + 2}: Initiative="${initiative}", ID="${extractedId}" (from Col ${idIdx !== undefined ? String.fromCharCode(65 + idIdx) : 'N/A'})`);
        }

        const project: ParsedProject = {
            projectName: String(initiative).trim(),
            legacyId: extractedId,
            powerSteeringId: extractedId,
            description: descIdx !== undefined ? getString(row[descIdx]) : null,
            status: statusIdx !== undefined ? getString(row[statusIdx]) || "Draft" : "Draft",
            totalEsfuerzo: esfuerzoIdx !== undefined ? parseScore(row[esfuerzoIdx]) : null,
            totalValor: valorIdx !== undefined ? parseScore(row[valorIdx]) : null,
            sourceVersionId: versionId,
            isActive: true,
            extraFields: {},
        };

        // Fill extra fields for persistence
        headerRow.forEach((h: any, idx: number) => {
            if (h) {
                const val = row[idx];
                project.extraFields![String(h)] = val !== undefined ? val : null;
            }
        });

        projects.push(project);
    }

    return {
        projects,
        advertencias,
        totalRows: dataRows.length,
        proyectosCreados: projects.length,
        proyectosBorradorIncompleto: 0,
        filasDescartadas: dataRows.length - projects.length,
    };
}

function getString(val: any): string | null {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    return s.length > 0 ? s : null;
}

function parseScore(val: any): number | null {
    if (val === null || val === undefined) return null;
    const num = Number(val);
    if (isNaN(num)) return null;
    // Clamped 1-25 per PMO standards
    return Math.min(25, Math.max(1, num));
}
