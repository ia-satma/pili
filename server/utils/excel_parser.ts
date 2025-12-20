import * as XLSX from "xlsx";
// import { type ParsedExcelData, type RowWarning } from "../excel-parser"; // Removed conflicting/circular import

export interface ParsedProject {
    projectName: string;
    legacyId: string | null;
    powerSteeringId: string | null;
    description: string | null;
    status: string;
    totalEsfuerzo: number | null;
    totalValor: number | null;

    // NEW FIELDS
    owner: string | null;
    sponsor: string | null;
    leader: string | null;
    businessUnit: string | null;
    progress: number | null;
    impactDescription: string | null;
    startDate: string | null;
    endDate: string | null;
    dependencies: string | null;

    sourceVersionId: number;
    isActive: boolean;
    sourceOrigin: string;
    extraFields: Record<string, any>;
    metadata?: Record<string, any>;
}

export interface ParsedExcelData {

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

// NEW MAPPINGS
const ownerIdx = getIdx(["dueño del proyecto", "owner", "dueño"]);
const sponsorIdx = getIdx(["sponsor", "patrocinador"]);
const leaderIdx = getIdx(["líder", "lider", "leader"]); // Was 'responsible'
const businessUnitIdx = getIdx(["dirección de negocio", "negocio/área", "negocio", "business unit"]);
const progressIdx = getIdx(["progreso", "%", "avance"]);
const impactDescIdx = getIdx(["beneficios estimados", "impacto", "beneficio"]);
const startDateIdx = getIdx(["fecha inicio", "start date", "inicio"]);
const endDateIdx = getIdx(["fecha fin", "fecha de término", "end date", "fin"]);
const dependenciesIdx = getIdx(["dependencias", "bloqueos", "dependencies"]);

if (initiativeIdx === undefined) {
    throw new Error("No se pudo encontrar la columna 'Iniciativa' en la Fila 4.");
}

// HELPER: Robust Date Parser
const parseDate = (val: any): string | null => {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'number') {
        // Excel Serial Date
        const date = XLSX.SSF.parse_date_code(val);
        if (date) {
            // Ensure double digits for month/day
            const pad = (n: number) => n < 10 ? `0${n}` : n;
            return `${date.y}-${pad(date.m)}-${pad(date.d)}`;
        }
    }
    // Try parsing string
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
    return null;
};

// HELPER: Robust Percent Parser
const parsePercent = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') {
        // If < 1, assumes generic excel percentage (0.5 = 50%)
        // If > 1, assumes integer (50 = 50%)
        return val <= 1 ? Math.round(val * 100) : Math.round(val);
    }
    if (typeof val === 'string') {
        const clean = val.replace('%', '').trim();
        const num = parseFloat(clean);
        return isNaN(num) ? null : Math.round(num);
    }
    return null;
};

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
        // console.log(`[Parser] Row ${i + headerRowIndex + 2}: Initiative="${initiative}", ID="${extractedId}" (from Col ${idIdx !== undefined ? String.fromCharCode(65 + idIdx) : 'N/A'})`);
    }

    const project: ParsedProject = {
        projectName: String(initiative).trim(),
        legacyId: extractedId,
        powerSteeringId: extractedId,
        description: descIdx !== undefined ? getString(row[descIdx]) : null,
        status: statusIdx !== undefined ? getString(row[statusIdx]) || "Draft" : "Draft",
        totalEsfuerzo: esfuerzoIdx !== undefined ? parseScore(row[esfuerzoIdx]) : null,
        totalValor: valorIdx !== undefined ? parseScore(row[valorIdx]) : null,

        // NEW FIELDS
        owner: ownerIdx !== undefined ? getString(row[ownerIdx]) : null,
        sponsor: sponsorIdx !== undefined ? getString(row[sponsorIdx]) : null,
        leader: leaderIdx !== undefined ? getString(row[leaderIdx]) : null,
        businessUnit: businessUnitIdx !== undefined ? getString(row[businessUnitIdx]) : null,
        progress: progressIdx !== undefined ? parsePercent(row[progressIdx]) : null,
        impactDescription: impactDescIdx !== undefined ? getString(row[impactDescIdx]) : null,
        startDate: startDateIdx !== undefined ? parseDate(row[startDateIdx]) : null,
        endDate: endDateIdx !== undefined ? parseDate(row[endDateIdx]) : null,
        dependencies: dependenciesIdx !== undefined ? getString(row[dependenciesIdx]) : null,

        sourceVersionId: versionId,
        isActive: true,
        sourceOrigin: 'EXCEL_VALIDATED',
        extraFields: {},
        metadata: {},
    };

    // METADATA CATCH-ALL: Persist EVERYTHING from the row into metadata
    // This ensures no column is ever lost again.
    headerRow.forEach((h: any, idx: number) => {
        if (h) {
            const val = row[idx];
            if (val !== undefined && val !== null) {
                project.metadata![String(h)] = val;
                project.extraFields![String(h)] = val; // Keep for legacy compat
            }
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
