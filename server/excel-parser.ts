import * as XLSX from "xlsx";

export type ErrorType = 
  | "row_empty" 
  | "row_unreadable" 
  | "missing_project_name" 
  | "invalid_date" 
  | "unknown_catalog_value";

export interface RowWarning {
  fila: number;
  tipo: ErrorType;
  mensaje: string;
}

export interface ParsedProject {
  legacyId?: string | null;
  projectName: string;
  description?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  responsible?: string | null;
  sponsor?: string | null;
  status?: string | null;
  priority?: string | null;
  category?: string | null;
  projectType?: string | null;
  startDate?: string | null;
  startDateOriginal?: string | null;
  endDateEstimated?: string | null;
  endDateEstimatedOriginal?: string | null;
  endDateEstimatedTbd?: boolean | null;
  endDateActual?: string | null;
  endDateActualOriginal?: string | null;
  registrationDate?: string | null;
  registrationDateOriginal?: string | null;
  percentComplete?: number | null;
  statusText?: string | null;
  parsedStatus?: string | null;
  parsedNextSteps?: string | null;
  benefits?: string | null;
  scope?: string | null;
  risks?: string | null;
  comments?: string | null;
  lastUpdateText?: string | null;
  extraFields?: Record<string, unknown>;
  esBorradorIncompleto?: boolean | null;
  requiereNombre?: boolean | null;
  fechaInvalida?: boolean | null;
  catalogoPendienteMapeo?: boolean | null;
  sourceVersionId?: number | null;
  isActive?: boolean | null;
}

export interface ParsedExcelData {
  projects: ParsedProject[];
  advertencias: RowWarning[];
  totalRows: number;
  proyectosCreados: number;
  proyectosBorradorIncompleto: number;
  filasDescartadas: number;
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
      const sStart = sIndex + sMatch[0].length;
      parsedStatus = trimmedText.substring(sStart, nIndex).trim();
      parsedNextSteps = trimmedText.substring(nIndex + nMatch[0].length).trim();
    } else {
      const nStart = nIndex + nMatch[0].length;
      parsedNextSteps = trimmedText.substring(nStart, sIndex).trim();
      parsedStatus = trimmedText.substring(sIndex + sMatch[0].length).trim();
    }
  } else if (sMatch) {
    const sIndex = trimmedText.search(sPattern);
    parsedStatus = trimmedText.substring(sIndex + sMatch[0].length).trim();
  } else if (nMatch) {
    const nIndex = trimmedText.search(nPattern);
    parsedNextSteps = trimmedText.substring(nIndex + nMatch[0].length).trim();
  }
  
  return {
    statusText: trimmedText,
    parsedStatus: parsedStatus || null,
    parsedNextSteps: parsedNextSteps || null,
  };
}

// Parse date - DETERMINISTIC, no interpretation
// Returns invalid flag if date cannot be parsed (soft error)
function parseDate(value: unknown): { 
  date: string | null; 
  original: string | null; 
  isTbd: boolean;
  isInvalid: boolean;
} {
  if (value === null || value === undefined) {
    return { date: null, original: null, isTbd: false, isInvalid: false };
  }
  
  const strValue = String(value).trim();
  const original = strValue;
  
  if (strValue === "") {
    return { date: null, original: null, isTbd: false, isInvalid: false };
  }
  
  // Check for TBD
  if (strValue.toLowerCase() === "tbd" || strValue.toLowerCase() === "por definir") {
    return { date: null, original, isTbd: true, isInvalid: false };
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
          isTbd: false,
          isInvalid: false
        };
      }
    } catch {
      // Fall through to string parsing
    }
  }
  
  // Try to parse as ISO date string
  if (strValue.match(/^\d{4}-\d{2}-\d{2}/)) {
    return { date: strValue.split("T")[0], original, isTbd: false, isInvalid: false };
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
          isInvalid: false
        };
      }
    }
  }
  
  // Can't parse - this is a soft error (invalid date)
  return { date: null, original, isTbd: false, isInvalid: true };
}

// Parse percentage
function parsePercentage(value: unknown): number {
  if (value === null || value === undefined) return 0;
  
  if (typeof value === "number") {
    if (value >= 0 && value <= 1) {
      return Math.round(value * 100);
    }
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

// Priority column name lists - these are tried in order (exact match first)
const PROJECT_NAME_COLUMNS = [
  "iniciativa",
  "iniciativa ", // with trailing space
  "nombre de iniciativa",
  "proyecto",
  "project",
  "project_name",
  "projectname",
  "nombre",
  "nombre del proyecto",
  "nombre proyecto",
  "name",
  "title",
  "titulo",
  "título",
];

// Partial matches for project name (if exact match fails)
const PROJECT_NAME_PARTIAL = [
  "iniciativa",
  "proyecto",
  "project",
  "nombre",
  "name",
  "titulo",
  "title",
];

const LEGACY_ID_COLUMNS = [
  "id",
  "código",
  "codigo",
  "id power steering",
  "card id devops",
  "legacy_id",
  "legacyid",
  "no.",
  "no",
  "numero",
  "folio",
  "clave",
  "key",
];

// Column name mapping - maps various column headers to our schema fields
type ProjectField = keyof ParsedProject;
const COLUMN_MAPPINGS: Record<string, ProjectField> = {
  // ID - handled separately via LEGACY_ID_COLUMNS priority
  "id": "legacyId",
  "legacy_id": "legacyId",
  "legacyid": "legacyId",
  "no.": "legacyId",
  "no": "legacyId",
  "numero": "legacyId",
  "código": "legacyId",
  "codigo": "legacyId",
  "id power steering": "legacyId",
  "card id devops": "legacyId",
  
  // Project name - handled separately via PROJECT_NAME_COLUMNS priority
  "iniciativa": "projectName",
  "iniciativa ": "projectName",
  "nombre de iniciativa": "projectName",
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

function mapColumnToField(columnName: string): ProjectField | null {
  const normalized = normalizeColumnName(columnName);
  return COLUMN_MAPPINGS[normalized] || null;
}

// Check if a row is completely empty
function isRowEmpty(row: RawExcelRow): boolean {
  for (const value of Object.values(row)) {
    if (value !== null && value !== undefined) {
      const strVal = String(value).trim();
      if (strVal.length > 0) {
        return false;
      }
    }
  }
  return true;
}

// Find the best column for a field based on priority list
function findPriorityColumn(headers: string[], priorityList: string[], partialList?: string[]): string | null {
  // First try exact match
  for (const priority of priorityList) {
    for (const header of headers) {
      if (normalizeColumnName(header) === priority) {
        console.log(`[Excel Parser] Found exact match column: "${header}" for priority "${priority}"`);
        return header;
      }
    }
  }
  
  // If exact match fails and partialList provided, try partial matching
  if (partialList) {
    for (const partial of partialList) {
      for (const header of headers) {
        const normalized = normalizeColumnName(header);
        if (normalized.includes(partial) || partial.includes(normalized)) {
          console.log(`[Excel Parser] Found partial match column: "${header}" contains "${partial}"`);
          return header;
        }
      }
    }
  }
  
  return null;
}

// Debug function to log all headers
function logHeaders(headers: string[]): void {
  console.log(`[Excel Parser] Found ${headers.length} columns:`);
  headers.forEach((h, i) => console.log(`  ${i + 1}. "${h}" -> normalized: "${normalizeColumnName(h)}"`));
}

export function parseExcelBuffer(buffer: Buffer, versionId: number): ParsedExcelData {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const advertencias: RowWarning[] = [];
  const projects: ParsedProject[] = [];
  let totalRows = 0;
  let proyectosCreados = 0;
  let proyectosBorradorIncompleto = 0;
  let filasDescartadas = 0;
  
  // Find the main data sheet - prioritize "Proyectos por los líderes"
  let sheetName = workbook.SheetNames[0];
  const prioritySheetNames = [
    "proyectos por los líderes",
    "proyectos por los lideres", 
    "proyectos",
    "projects",
    "data",
    "matriz",
    "base"
  ];
  
  for (const name of workbook.SheetNames) {
    const lowerName = name.toLowerCase().trim();
    for (const priority of prioritySheetNames) {
      if (lowerName === priority || lowerName.includes(priority)) {
        sheetName = name;
        break;
      }
    }
    if (sheetName !== workbook.SheetNames[0]) break;
  }
  
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    advertencias.push({
      fila: 0,
      tipo: "row_unreadable",
      mensaje: "No se encontró una hoja de datos válida"
    });
    return { projects, advertencias, totalRows: 0, proyectosCreados: 0, proyectosBorradorIncompleto: 0, filasDescartadas: 1 };
  }
  
  // Convert to JSON with header row
  const rawData = XLSX.utils.sheet_to_json<RawExcelRow>(sheet, { defval: null });
  totalRows = rawData.length;
  
  if (totalRows === 0) {
    advertencias.push({
      fila: 0,
      tipo: "row_empty",
      mensaje: "La hoja de datos está vacía"
    });
    return { projects, advertencias, totalRows: 0, proyectosCreados: 0, proyectosBorradorIncompleto: 0, filasDescartadas: 0 };
  }
  
  // Get column headers from first row
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    headers.push(cell?.v ? String(cell.v) : `Column${c}`);
  }
  
  // Log all headers for debugging
  logHeaders(headers);
  
  // Find priority columns for project name and legacy ID (with partial matching fallback)
  const projectNameColumn = findPriorityColumn(headers, PROJECT_NAME_COLUMNS, PROJECT_NAME_PARTIAL);
  const legacyIdColumn = findPriorityColumn(headers, LEGACY_ID_COLUMNS);
  
  console.log(`[Excel Parser] Project name column: ${projectNameColumn || "NOT FOUND"}`);
  console.log(`[Excel Parser] Legacy ID column: ${legacyIdColumn || "NOT FOUND"}`);
  
  // Process each row
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const rowNum = i + 2; // +2 because of header row and 1-indexing
    
    // HARD ERROR: Check if row is completely empty
    if (isRowEmpty(row)) {
      filasDescartadas++;
      advertencias.push({
        fila: rowNum,
        tipo: "row_empty",
        mensaje: "Fila totalmente vacía - no crear proyecto"
      });
      continue;
    }
    
    try {
      const project: Partial<ParsedProject> = {
        sourceVersionId: versionId,
        isActive: true,
        extraFields: {},
        esBorradorIncompleto: false,
        requiereNombre: false,
        fechaInvalida: false,
        catalogoPendienteMapeo: false,
      };
      
      let hasSoftError = false;
      
      // First, try to get project name from priority column
      let projectName: string | null = null;
      if (projectNameColumn && row[projectNameColumn] !== undefined) {
        projectName = getString(row[projectNameColumn]);
      }
      
      // Get legacy ID from priority column
      let legacyId: string | null = null;
      if (legacyIdColumn && row[legacyIdColumn] !== undefined) {
        legacyId = getString(row[legacyIdColumn]);
      }
      
      // Map each column
      for (const [key, value] of Object.entries(row)) {
        const field = mapColumnToField(key);
        
        if (field) {
          switch (field) {
            case "projectName":
              // Only use if not already set from priority column
              if (!projectName) {
                projectName = getString(value);
              }
              break;
              
            case "legacyId":
              // Only use if not already set from priority column
              if (!legacyId) {
                legacyId = getString(value);
              }
              break;
              
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
              if (parsed.isInvalid) {
                project.fechaInvalida = true;
                hasSoftError = true;
                advertencias.push({
                  fila: rowNum,
                  tipo: "invalid_date",
                  mensaje: `Fecha de inicio inválida: "${parsed.original}"`
                });
              }
              break;
            }
            
            case "endDateEstimated": {
              const parsed = parseDate(value);
              project.endDateEstimated = parsed.date;
              project.endDateEstimatedOriginal = parsed.original;
              project.endDateEstimatedTbd = parsed.isTbd;
              if (parsed.isInvalid) {
                project.fechaInvalida = true;
                hasSoftError = true;
                advertencias.push({
                  fila: rowNum,
                  tipo: "invalid_date",
                  mensaje: `Fecha fin estimada inválida: "${parsed.original}"`
                });
              }
              break;
            }
            
            case "endDateActual": {
              const parsed = parseDate(value);
              project.endDateActual = parsed.date;
              project.endDateActualOriginal = parsed.original;
              if (parsed.isInvalid) {
                project.fechaInvalida = true;
                hasSoftError = true;
                advertencias.push({
                  fila: rowNum,
                  tipo: "invalid_date",
                  mensaje: `Fecha fin real inválida: "${parsed.original}"`
                });
              }
              break;
            }
            
            case "registrationDate": {
              const parsed = parseDate(value);
              project.registrationDate = parsed.date;
              project.registrationDateOriginal = parsed.original;
              if (parsed.isInvalid) {
                project.fechaInvalida = true;
                hasSoftError = true;
                advertencias.push({
                  fila: rowNum,
                  tipo: "invalid_date",
                  mensaje: `Fecha de registro inválida: "${parsed.original}"`
                });
              }
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
      
      // Set the final project name and legacy ID
      project.legacyId = legacyId;
      
      // SOFT ERROR: Check if project name is missing
      if (!projectName) {
        // Create as draft project with placeholder name
        project.projectName = `Borrador Incompleto (Fila ${rowNum})`;
        project.esBorradorIncompleto = true;
        project.requiereNombre = true;
        hasSoftError = true;
        advertencias.push({
          fila: rowNum,
          tipo: "missing_project_name",
          mensaje: "Nombre del proyecto faltante - creado como borrador incompleto"
        });
      } else {
        project.projectName = projectName;
      }
      
      // Generate legacy ID if not provided
      if (!project.legacyId) {
        project.legacyId = `ROW-${rowNum}`;
      }
      
      // Mark as draft if any soft error occurred
      if (hasSoftError) {
        project.esBorradorIncompleto = true;
        proyectosBorradorIncompleto++;
      } else {
        proyectosCreados++;
      }
      
      projects.push(project as ParsedProject);
      
    } catch (error) {
      // HARD ERROR: Row unreadable
      filasDescartadas++;
      advertencias.push({
        fila: rowNum,
        tipo: "row_unreadable",
        mensaje: `Fila ilegible - ${error instanceof Error ? error.message : "Error desconocido"}`
      });
    }
  }
  
  // Important rule: If there's at least one non-empty row, we must have at least 1 processed
  const nonEmptyRows = totalRows - filasDescartadas;
  if (nonEmptyRows > 0 && (proyectosCreados + proyectosBorradorIncompleto) === 0) {
    // This shouldn't happen, but if it does, we need to ensure at least one project
    advertencias.push({
      fila: 0,
      tipo: "row_unreadable",
      mensaje: "Advertencia: No se pudo procesar ningún proyecto de las filas no vacías"
    });
  }
  
  return { 
    projects, 
    advertencias, 
    totalRows, 
    proyectosCreados, 
    proyectosBorradorIncompleto,
    filasDescartadas
  };
}
