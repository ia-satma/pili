import * as XLSX from "xlsx";
import type { InsertProject } from "@shared/schema";

export interface ParsedExcelData {
  projects: InsertProject[];
  errors: string[];
  totalRows: number;
  processedRows: number;
}

interface RawExcelRow {
  [key: string]: unknown;
}

// Deterministic S/N parser - NO NLP, just regex
export function parseSNText(text: string | null | undefined): {
  statusText: string | null;
  parsedStatus: string | null;
  parsedNextSteps: string | null;
} {
  if (!text || typeof text !== "string") {
    return { statusText: null, parsedStatus: null, parsedNextSteps: null };
  }

  const trimmedText = text.trim();
  
  // Try to find S: and N: patterns
  // Pattern: "S: <status text> N: <next steps text>" or variations
  const sPattern = /S\s*[:：]\s*/i;
  const nPattern = /N\s*[:：]\s*/i;
  
  const sMatch = trimmedText.match(sPattern);
  const nMatch = trimmedText.match(nPattern);
  
  let parsedStatus: string | null = null;
  let parsedNextSteps: string | null = null;
  
  if (sMatch && nMatch) {
    const sIndex = trimmedText.search(sPattern);
    const nIndex = trimmedText.search(nPattern);
    
    if (sIndex < nIndex) {
      // S: comes before N:
      const sStart = sIndex + sMatch[0].length;
      parsedStatus = trimmedText.substring(sStart, nIndex).trim();
      parsedNextSteps = trimmedText.substring(nIndex + nMatch[0].length).trim();
    } else {
      // N: comes before S:
      const nStart = nIndex + nMatch[0].length;
      parsedNextSteps = trimmedText.substring(nStart, sIndex).trim();
      parsedStatus = trimmedText.substring(sIndex + sMatch[0].length).trim();
    }
  } else if (sMatch) {
    // Only S: found
    const sIndex = trimmedText.search(sPattern);
    parsedStatus = trimmedText.substring(sIndex + sMatch[0].length).trim();
  } else if (nMatch) {
    // Only N: found
    const nIndex = trimmedText.search(nPattern);
    parsedNextSteps = trimmedText.substring(nIndex + nMatch[0].length).trim();
  }
  
  // If no patterns found, store everything in statusText as fallback
  return {
    statusText: trimmedText,
    parsedStatus: parsedStatus || null,
    parsedNextSteps: parsedNextSteps || null,
  };
}

// Parse date - DETERMINISTIC, no interpretation
function parseDate(value: unknown): { date: string | null; original: string | null; isTbd: boolean } {
  if (value === null || value === undefined) {
    return { date: null, original: null, isTbd: false };
  }
  
  const strValue = String(value).trim();
  const original = strValue;
  
  // Check for TBD
  if (strValue.toLowerCase() === "tbd" || strValue.toLowerCase() === "por definir") {
    return { date: null, original, isTbd: true };
  }
  
  // Try to parse as Excel serial number
  if (typeof value === "number") {
    try {
      const excelDate = XLSX.SSF.parse_date_code(value);
      if (excelDate) {
        const date = new Date(excelDate.y, excelDate.m - 1, excelDate.d);
        return { 
          date: date.toISOString().split("T")[0], 
          original,
          isTbd: false 
        };
      }
    } catch {
      // Fall through to string parsing
    }
  }
  
  // Try to parse as ISO date string
  if (strValue.match(/^\d{4}-\d{2}-\d{2}/)) {
    return { date: strValue.split("T")[0], original, isTbd: false };
  }
  
  // Try common date formats
  const datePatterns = [
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/, // DD/MM/YYYY or MM/DD/YYYY
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/, // DD/MM/YY
  ];
  
  for (const pattern of datePatterns) {
    const match = strValue.match(pattern);
    if (match) {
      let year = parseInt(match[3]);
      if (year < 100) {
        year += year > 50 ? 1900 : 2000;
      }
      // Assume DD/MM/YYYY format (common in Spanish)
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const date = new Date(year, month - 1, day);
        return {
          date: date.toISOString().split("T")[0],
          original,
          isTbd: false,
        };
      }
    }
  }
  
  // Can't parse, return null but keep original
  return { date: null, original, isTbd: false };
}

// Parse percentage
function parsePercentage(value: unknown): number {
  if (value === null || value === undefined) return 0;
  
  if (typeof value === "number") {
    // If between 0-1, treat as decimal percentage
    if (value >= 0 && value <= 1) {
      return Math.round(value * 100);
    }
    // Otherwise assume it's already a percentage
    return Math.round(Math.min(100, Math.max(0, value)));
  }
  
  const strValue = String(value).replace("%", "").trim();
  const parsed = parseFloat(strValue);
  
  if (isNaN(parsed)) return 0;
  return Math.round(Math.min(100, Math.max(0, parsed)));
}

// Get string value safely
function getString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

// Column name mapping - maps various column headers to our schema fields
const COLUMN_MAPPINGS: Record<string, keyof InsertProject> = {
  // ID
  "id": "legacyId",
  "legacy_id": "legacyId",
  "legacyid": "legacyId",
  "no.": "legacyId",
  "no": "legacyId",
  "numero": "legacyId",
  
  // Project name
  "proyecto": "projectName",
  "project": "projectName",
  "project_name": "projectName",
  "projectname": "projectName",
  "nombre": "projectName",
  "nombre del proyecto": "projectName",
  "nombre proyecto": "projectName",
  
  // Description
  "descripcion": "description",
  "description": "description",
  "descripción": "description",
  
  // Department
  "departamento": "departmentName",
  "department": "departmentName",
  "dept": "departmentName",
  "area": "departmentName",
  "área": "departmentName",
  
  // Responsible
  "responsable": "responsible",
  "responsible": "responsible",
  "owner": "responsible",
  "lider": "responsible",
  "líder": "responsible",
  
  // Sponsor
  "sponsor": "sponsor",
  "patrocinador": "sponsor",
  
  // Status
  "estado": "status",
  "status": "status",
  "estatus": "status",
  
  // Priority
  "prioridad": "priority",
  "priority": "priority",
  
  // Category
  "categoria": "category",
  "categoría": "category",
  "category": "category",
  "tipo": "category",
  "type": "category",
  
  // Project type
  "tipo de proyecto": "projectType",
  "project_type": "projectType",
  "projecttype": "projectType",
  
  // Start date
  "fecha inicio": "startDate",
  "fecha_inicio": "startDate",
  "fechainicio": "startDate",
  "start_date": "startDate",
  "startdate": "startDate",
  "inicio": "startDate",
  
  // End date estimated
  "fecha fin estimada": "endDateEstimated",
  "fecha_fin_estimada": "endDateEstimated",
  "fechafinestimada": "endDateEstimated",
  "end_date_estimated": "endDateEstimated",
  "fin estimado": "endDateEstimated",
  "fecha fin": "endDateEstimated",
  "fecha_fin": "endDateEstimated",
  "fin": "endDateEstimated",
  
  // End date actual
  "fecha fin real": "endDateActual",
  "fecha_fin_real": "endDateActual",
  "end_date_actual": "endDateActual",
  "fin real": "endDateActual",
  
  // Registration date
  "fecha registro": "registrationDate",
  "fecha_registro": "registrationDate",
  "registration_date": "registrationDate",
  "fecha alta": "registrationDate",
  
  // Percent complete
  "avance": "percentComplete",
  "% avance": "percentComplete",
  "%avance": "percentComplete",
  "porcentaje": "percentComplete",
  "percent_complete": "percentComplete",
  "progress": "percentComplete",
  "progreso": "percentComplete",
  
  // S/N field
  "s/n": "statusText",
  "s:n:": "statusText",
  "actualizacion": "statusText",
  "actualización": "statusText",
  "update": "statusText",
  "status update": "statusText",
  "status/next steps": "statusText",
  "estatus/siguientes pasos": "statusText",
  
  // Benefits
  "beneficios": "benefits",
  "benefits": "benefits",
  
  // Scope
  "alcance": "scope",
  "scope": "scope",
  
  // Risks
  "riesgos": "risks",
  "risks": "risks",
  
  // Comments
  "comentarios": "comments",
  "comments": "comments",
  "notas": "comments",
  "notes": "comments",
};

function normalizeColumnName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function mapColumnToField(columnName: string): keyof InsertProject | null {
  const normalized = normalizeColumnName(columnName);
  return COLUMN_MAPPINGS[normalized] || null;
}

export function parseExcelBuffer(buffer: Buffer, versionId: number): ParsedExcelData {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const errors: string[] = [];
  const projects: InsertProject[] = [];
  let totalRows = 0;
  let processedRows = 0;
  
  // Find the main data sheet (usually first or one named "Proyectos", "Data", etc.)
  let sheetName = workbook.SheetNames[0];
  const dataSheetNames = ["proyectos", "projects", "data", "matriz", "base"];
  for (const name of workbook.SheetNames) {
    if (dataSheetNames.includes(name.toLowerCase())) {
      sheetName = name;
      break;
    }
  }
  
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    errors.push("No se encontró una hoja de datos válida");
    return { projects, errors, totalRows: 0, processedRows: 0 };
  }
  
  // Convert to JSON with header row
  const rawData = XLSX.utils.sheet_to_json<RawExcelRow>(sheet, { defval: null });
  totalRows = rawData.length;
  
  if (totalRows === 0) {
    errors.push("La hoja de datos está vacía");
    return { projects, errors, totalRows: 0, processedRows: 0 };
  }
  
  // Get column headers from first row
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    headers.push(cell?.v ? String(cell.v) : `Column${c}`);
  }
  
  // Process each row
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const rowNum = i + 2; // +2 because of header row and 1-indexing
    
    try {
      const project: Partial<InsertProject> = {
        sourceVersionId: versionId,
        isActive: true,
        extraFields: {},
      };
      
      // Map each column
      for (const [key, value] of Object.entries(row)) {
        const field = mapColumnToField(key);
        
        if (field) {
          switch (field) {
            case "projectName":
            case "legacyId":
            case "description":
            case "departmentName":
            case "responsible":
            case "sponsor":
            case "status":
            case "priority":
            case "category":
            case "projectType":
            case "benefits":
            case "scope":
            case "risks":
            case "comments":
              (project as any)[field] = getString(value);
              break;
              
            case "startDate": {
              const parsed = parseDate(value);
              project.startDate = parsed.date;
              project.startDateOriginal = parsed.original;
              break;
            }
            
            case "endDateEstimated": {
              const parsed = parseDate(value);
              project.endDateEstimated = parsed.date;
              project.endDateEstimatedOriginal = parsed.original;
              project.endDateEstimatedTbd = parsed.isTbd;
              break;
            }
            
            case "endDateActual": {
              const parsed = parseDate(value);
              project.endDateActual = parsed.date;
              project.endDateActualOriginal = parsed.original;
              break;
            }
            
            case "registrationDate": {
              const parsed = parseDate(value);
              project.registrationDate = parsed.date;
              project.registrationDateOriginal = parsed.original;
              break;
            }
            
            case "percentComplete":
              project.percentComplete = parsePercentage(value);
              break;
              
            case "statusText": {
              const snParsed = parseSNText(getString(value));
              project.statusText = snParsed.statusText;
              project.parsedStatus = snParsed.parsedStatus;
              project.parsedNextSteps = snParsed.parsedNextSteps;
              break;
            }
          }
        } else {
          // Store unmapped columns in extraFields
          if (value !== null && value !== undefined) {
            (project.extraFields as any)[key] = value;
          }
        }
      }
      
      // Validate required fields
      if (!project.projectName) {
        errors.push(`Fila ${rowNum}: Falta el nombre del proyecto`);
        continue;
      }
      
      // Generate legacy ID if not provided
      if (!project.legacyId) {
        project.legacyId = `ROW-${rowNum}`;
      }
      
      projects.push(project as InsertProject);
      processedRows++;
      
    } catch (error) {
      errors.push(`Fila ${rowNum}: Error al procesar - ${error instanceof Error ? error.message : "Error desconocido"}`);
    }
  }
  
  return { projects, errors, totalRows, processedRows };
}
