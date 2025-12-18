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

    // Fallback to first sheet if "Proyectos PGP" not found (per earlier logic, but log it)
    if (!sheetName) {
        sheetName = workbook.SheetNames[0];
        console.log(`[Excel Parser] Sheet "Proyectos PGP" not found, using "${sheetName}"`);
    }

    const sheet = workbook.Sheets[sheetName];

    /**
     * Use XLSX.utils.sheet_to_json with range: 3
     * This effectively skips the first 3 rows (Row 1, 2, 3) and uses Row 4 as the keys for the objects.
     */
    const rawData = XLSX.utils.sheet_to_json<any>(sheet, {
        range: 3,
        defval: null,
        raw: false, // Ensure we get strings for names
    });

    console.log(`[Excel Parser] Started parsing sheet "${sheetName}". Total raw rows (from Row 5): ${rawData.length}`);

    for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const excelLine = i + 5; // Header at 4, Data starts at 5

        const initiative = row["Iniciativa"];

        // MANDATORY: If "Iniciativa" is empty, skip row. Corrects "ghost rows".
        if (!initiative || String(initiative).trim() === "") {
            continue;
        }

        const project: ParsedProject = {
            projectName: String(initiative).trim(),
            legacyId: row["ID Power Steering"] ? String(row["ID Power Steering"]) : null,
            powerSteeringId: row["ID Power Steering"] ? String(row["ID Power Steering"]) : null,
            devopsCardId: row["Card ID DevOps"] ? String(row["Card ID DevOps"]) : null,
            description: row["Descripción"] ? String(row["Descripción"]) : null,
            status: row["Status"] ? String(row["Status"]) : "Draft",
            responsible: row["Dueño del Proyecto"] ? String(row["Dueño del Proyecto"]) : null,
            leader: row["Dueño del Proyecto"] ? String(row["Dueño del Proyecto"]) : null,
            sponsor: row["Sponsor"] ? String(row["Sponsor"]) : null,
            benefits: row["Beneficios Estimados"] ? String(row["Beneficios Estimados"]) : null,
            financialImpact: row["Beneficios Estimados"] ? String(row["Beneficios Estimados"]) : null,
            totalEsfuerzo: (row["Total Esfuerzo"] && !isNaN(Number(row["Total Esfuerzo"])))
                ? Math.min(25, Math.max(1, Number(row["Total Esfuerzo"])))
                : null,
            totalValor: (row["Total Valor"] && !isNaN(Number(row["Total Valor"])))
                ? Math.min(25, Math.max(1, Number(row["Total Valor"])))
                : null,
            sourceVersionId: versionId,
            isActive: true,
            extraFields: row,
        };

        // Metrics: Progreso / %
        const progress = row["Progreso"] || row["%"];
        if (progress !== null && progress !== undefined) {
            let pValue = 0;
            if (typeof progress === "number") {
                pValue = progress <= 1 ? progress * 100 : progress;
            } else {
                pValue = parseFloat(String(progress).replace("%", ""));
            }
            project.percentComplete = Math.round(Math.min(100, Math.max(0, pValue || 0)));
        }

        // Date Detection (Row 4+)
        for (const [key, val] of Object.entries(row)) {
            if (!val) continue;

            const lowerKey = key.toLowerCase();

            // Found in file: 2025-12-08 (likely "Fecha Creación" or "Inicio Real") -> start_date
            if (lowerKey.includes("inicio") || lowerKey.includes("creacion") || lowerKey.includes("start")) {
                const d = parseDate(val);
                if (d) project.startDate = d;
            }

            // Found in file: 2026-01-30 (likely "Fecha Fin" or "Deadline") -> end_date
            if (lowerKey.includes("fin") || lowerKey.includes("deadline") || lowerKey.includes("end")) {
                const d = parseDate(val);
                if (d) project.endDateEstimated = d;
            }
        }

        projects.push(project);
    }

    console.log(`[Excel Parser] Finished parsing. Created ${projects.length} project objects.`);

    return {
        projects,
        advertencias,
        totalRows: rawData.length,
        proyectosCreados: projects.length,
        proyectosBorradorIncompleto: 0,
        filasDescartadas: rawData.length - projects.length,
    };
}

function parseDate(val: any): string | null {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
        return val.toISOString().split("T")[0];
    }
    const str = String(val).trim();
    if (str.match(/^\d{4}-\d{2}-\d{2}/)) return str.substring(0, 10);

    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    return null;
}
