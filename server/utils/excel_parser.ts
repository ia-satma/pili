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

    // STRICT: Row 4 (Index 3) is always the header row per Forensic Mandate
    const headerRowIndex = 3;
    if (!rows[headerRowIndex]) {
        throw new Error("El archivo Excel no tiene el formato esperado (Fila 4 vacía).");
    }

    const headerRow = rows[headerRowIndex];
    const dataRows = rows.slice(headerRowIndex + 1);

    console.log(`[Excel Parser] STRICT Row 4 Header: ${JSON.stringify(headerRow.slice(0, 10))}`);

    // STRICT Mapping logic
    const colIndex: Record<string, number> = {};
    headerRow.forEach((h, idx) => {
        if (h) {
            const normalized = String(h).toLowerCase().trim();
            colIndex[normalized] = idx;
        }
    });

    const getIdx = (aliases: string[]) => {
        for (const alias of aliases) {
            const normalizedAlias = alias.toLowerCase().trim();
            if (colIndex[normalizedAlias] !== undefined) return colIndex[normalizedAlias];
        }
        return undefined;
    };

    const initiativeIdx = getIdx(["iniciativa", "nombre del proyecto", "proyecto"]);
    const idIdx = getIdx(["id power steering", "id ps", "card id devops"]);
    const descIdx = getIdx(["descripción", "descripcion", "detalles"]);
    const statusIdx = getIdx(["status", "estatus", "estado"]);
    const valorIdx = getIdx(["total valor", "valor"]);
    const esfuerzoIdx = getIdx(["total esfuerzo", "esfuerzo"]);

    if (initiativeIdx === undefined) {
        throw new Error("No se pudo encontrar la columna 'Iniciativa' en la Fila 4.");
    }

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || !Array.isArray(row)) continue;

        const initiative = row[initiativeIdx];
        if (!initiative || String(initiative).trim() === "") continue;

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
    // Removed 1-25 clamping to support user's full scale (0-1000+)
    return num;
}
