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

// Normalize header for matching (uppercase, no accents, no extra spaces)
function normalizeForMatching(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, " ")
    .trim();
}

// Priority column name lists - these are tried in order (exact match first)
// All tokens are normalized (uppercase, no accents)
const PROJECT_NAME_COLUMNS = [
  "iniciativa",
  "iniciativas",
  "iniciativa ", // with trailing space
  "nombre de iniciativa",
  "nombre del proyecto",
  "nombre proyecto",
  "proyecto",
  "project",
  "project_name",
  "projectname",
  "nombre",
  "name",
  "title",
  "titulo",
  "título",
];

// Partial matches for project name (if exact match fails)
const PROJECT_NAME_PARTIAL = [
  "iniciativa",
  "iniciativas",
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
// Uses aggressive normalization to match headers with different formats
function findPriorityColumn(headers: string[], priorityList: string[], partialList?: string[]): string | null {
  // First try exact match (case insensitive, trimmed)
  for (const priority of priorityList) {
    for (const header of headers) {
      if (normalizeColumnName(header) === priority) {
        console.log(`[Excel Parser] Found exact match column: "${header}" for priority "${priority}"`);
        return header;
      }
    }
  }
  
  // Try aggressive normalization match (uppercase, no accents)
  for (const priority of priorityList) {
    const normalizedPriority = normalizeForMatching(priority);
    for (const header of headers) {
      const normalizedHeader = normalizeForMatching(header);
      if (normalizedHeader === normalizedPriority) {
        console.log(`[Excel Parser] Found normalized match column: "${header}" matches "${priority}"`);
        return header;
      }
    }
  }
  
  // Try partial matching with aggressive normalization
  if (partialList) {
    for (const partial of partialList) {
      const normalizedPartial = normalizeForMatching(partial);
      for (const header of headers) {
        const normalizedHeader = normalizeForMatching(header);
        if (normalizedHeader.includes(normalizedPartial) || normalizedPartial.includes(normalizedHeader)) {
          console.log(`[Excel Parser] Found partial match column: "${header}" contains "${partial}"`);
          return header;
        }
      }
    }
  }
  
  return null;
}

// Debug function to log all headers
function logHeaders(headers: string[], rowNum: number): void {
  console.log(`[Excel Parser] Found ${headers.length} columns at row ${rowNum}:`);
  headers.forEach((h, i) => console.log(`  ${i + 1}. "${h}" -> normalized: "${normalizeColumnName(h)}"`));
}

// Function to detect if a row looks like a header row (has recognizable column names)
function isHeaderRow(headers: string[]): boolean {
  const validHeaders = headers.filter(h => {
    if (!h || h.startsWith("Column") || h.startsWith("__EMPTY")) return false;
    const normalized = normalizeColumnName(h);
    // Check if matches any known column mapping or partial keywords
    if (COLUMN_MAPPINGS[normalized]) return true;
    for (const partial of PROJECT_NAME_PARTIAL) {
      if (normalized.includes(partial)) return true;
    }
    for (const priority of LEGACY_ID_COLUMNS) {
      if (normalized === priority || normalized.includes(priority)) return true;
    }
    // Check for other known keywords
    const keywords = ["fecha", "date", "estatus", "status", "area", "responsable", "descripcion", "avance", "valor", "esfuerzo"];
    for (const kw of keywords) {
      if (normalized.includes(kw)) return true;
    }
    return false;
  });
  
  // If at least 3 valid headers found, consider it a header row
  return validHeaders.length >= 3;
}

// Function to get headers from a specific row
function getHeadersFromRow(sheet: XLSX.WorkSheet, rowIndex: number): string[] {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c })];
    headers.push(cell?.v ? String(cell.v) : `Column${c}`);
  }
  return headers;
}

// Function to find the actual header row (may not be row 1)
// Checks for Excel AutoFilter first, then scans for recognizable headers
function findHeaderRow(sheet: XLSX.WorkSheet): { headerRow: number; headers: string[] } {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const maxRowsToCheck = Math.min(20, range.e.r + 1); // Check first 20 rows max
  
  // Method 1: Check for Excel AutoFilter - if present, that's the header row
  // The '!autofilter' property contains the filter range
  const autofilter = (sheet as any)["!autofilter"];
  if (autofilter && autofilter.ref) {
    try {
      const filterRange = XLSX.utils.decode_range(autofilter.ref);
      const filterRow = filterRange.s.r; // Start row of the filter range
      const headers = getHeadersFromRow(sheet, filterRow);
      console.log(`[Excel Parser] Found AutoFilter at row ${filterRow + 1}, using as header row`);
      logHeaders(headers, filterRow + 1);
      return { headerRow: filterRow, headers };
    } catch (e) {
      console.log(`[Excel Parser] Error parsing AutoFilter: ${e}`);
    }
  }
  
  console.log(`[Excel Parser] No AutoFilter found, scanning first ${maxRowsToCheck} rows for header row...`);
  
  // Method 2: Look for row with most non-empty cells that have text (not numbers)
  // This often indicates a header row
  let bestRow = 0;
  let bestScore = 0;
  
  for (let r = 0; r < maxRowsToCheck; r++) {
    const headers = getHeadersFromRow(sheet, r);
    const nonEmptyCount = headers.filter(h => h && !h.startsWith("Column") && !h.startsWith("__EMPTY")).length;
    const textCount = headers.filter(h => {
      if (!h || h.startsWith("Column") || h.startsWith("__EMPTY")) return false;
      // Check if it looks like a header (text, not a number or date)
      const val = String(h).trim();
      if (/^\d+$/.test(val)) return false; // Pure number
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) return false; // Date
      return true;
    }).length;
    
    console.log(`[Excel Parser] Row ${r + 1}: ${nonEmptyCount} non-empty, ${textCount} text columns. First 5: ${headers.slice(0, 5).join(" | ")}`);
    
    // Score based on text columns and known headers
    let score = textCount * 2;
    if (isHeaderRow(headers)) {
      score += 10; // Bonus for matching known headers
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
    
    // If we find a row with known headers and good score, use it
    if (isHeaderRow(headers) && textCount >= 5) {
      console.log(`[Excel Parser] Found header row at row ${r + 1} with ${textCount} text columns`);
      return { headerRow: r, headers };
    }
  }
  
  // Use the best row we found
  if (bestScore > 0) {
    const headers = getHeadersFromRow(sheet, bestRow);
    console.log(`[Excel Parser] Using best candidate row ${bestRow + 1} with score ${bestScore}`);
    return { headerRow: bestRow, headers };
  }
  
  // Fallback to first row if no valid header row found
  console.log(`[Excel Parser] No valid header row found, defaulting to row 1`);
  return { headerRow: 0, headers: getHeadersFromRow(sheet, 0) };
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
  
  console.log(`[Excel Parser] Using sheet: "${sheetName}"`);
  
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    advertencias.push({
      fila: 0,
      tipo: "row_unreadable",
      mensaje: "No se encontró una hoja de datos válida"
    });
    return { projects, advertencias, totalRows: 0, proyectosCreados: 0, proyectosBorradorIncompleto: 0, filasDescartadas: 1 };
  }
  
  // Find the actual header row (may not be row 1)
  const { headerRow, headers } = findHeaderRow(sheet);
  
  // Log all headers for debugging
  logHeaders(headers, headerRow + 1);
  
  // Convert to JSON starting from the header row
  const rawData = XLSX.utils.sheet_to_json<RawExcelRow>(sheet, { 
    defval: null,
    range: headerRow // Start from the detected header row
  });
  totalRows = rawData.length;
  
  console.log(`[Excel Parser] Total data rows (after header): ${totalRows}`);
  
  if (totalRows === 0) {
    advertencias.push({
      fila: 0,
      tipo: "row_empty",
      mensaje: "La hoja de datos está vacía"
    });
    return { projects, advertencias, totalRows: 0, proyectosCreados: 0, proyectosBorradorIncompleto: 0, filasDescartadas: 0 };
  }
  
  // Find priority columns for project name and legacy ID (with partial matching fallback)
  const projectNameColumn = findPriorityColumn(headers, PROJECT_NAME_COLUMNS, PROJECT_NAME_PARTIAL);
  const legacyIdColumn = findPriorityColumn(headers, LEGACY_ID_COLUMNS);
  
  console.log(`[Excel Parser] Project name column: ${projectNameColumn || "NOT FOUND"}`);
  console.log(`[Excel Parser] Legacy ID column: ${legacyIdColumn || "NOT FOUND"}`);
  
  // Forward-fill tracking: keep the last valid project name for merged cell support
  let lastValidProjectName: string | null = null;
  let forwardFillCount = 0;
  
  // Process each row
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const rowNum = headerRow + i + 2; // Actual Excel row number (header row + data row index + 1 for 1-indexing)
    
    // Check if row is completely empty - silently ignore (no warning, no project)
    if (isRowEmpty(row)) {
      // Don't increment filasDescartadas, just silently skip empty rows
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
      let usedForwardFill = false;
      
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
      
      // FORWARD-FILL LOGIC: If project name is missing but row has data, try to use last valid name
      if (!projectName) {
        // Check if this row has meaningful data (not just empty values)
        const hasOtherData = Object.entries(row).some(([key, value]) => {
          if (key === projectNameColumn) return false;
          if (key === legacyIdColumn) return false;
          if (value === null || value === undefined) return false;
          const strVal = String(value).trim();
          if (strVal.length === 0) return false;
          // Ignore numeric columns that are just row numbers
          if (key.includes("__EMPTY") && /^\d+$/.test(strVal) && parseInt(strVal) < 100) return false;
          return true;
        });
        
        if (hasOtherData && lastValidProjectName) {
          // Use forward-fill: inherit name from previous row
          projectName = lastValidProjectName;
          usedForwardFill = true;
          forwardFillCount++;
          console.log(`[Excel Parser] Row ${rowNum}: Forward-fill applied, using "${projectName}" from previous row`);
        } else if (hasOtherData) {
          // Row has data but no name to forward-fill - mark as borrador incompleto
          project.projectName = `Borrador Incompleto (Fila ${rowNum})`;
          project.esBorradorIncompleto = true;
          project.requiereNombre = true;
          hasSoftError = true;
          advertencias.push({
            fila: rowNum,
            tipo: "missing_project_name",
            mensaje: "Nombre del proyecto faltante (sin nombre anterior para heredar) - creado como borrador incompleto"
          });
        } else {
          // Row appears to be mostly empty - skip silently
          continue;
        }
      }
      
      // If we got a valid project name (either directly or via forward-fill)
      if (projectName) {
        project.projectName = projectName;
        // Update the last valid project name for future forward-fill
        lastValidProjectName = projectName;
      }
      
      // Generate legacy ID if not provided
      if (!project.legacyId) {
        project.legacyId = `ROW-${rowNum}`;
      }
      
      // Mark as draft if any soft error occurred (but forward-fill is NOT an error)
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
  
  // Log summary
  console.log(`[Excel Parser] === PARSING SUMMARY ===`);
  console.log(`[Excel Parser] Total rows processed: ${totalRows}`);
  console.log(`[Excel Parser] Projects created (complete): ${proyectosCreados}`);
  console.log(`[Excel Parser] Projects created (draft/incomplete): ${proyectosBorradorIncompleto}`);
  console.log(`[Excel Parser] Rows discarded: ${filasDescartadas}`);
  console.log(`[Excel Parser] Forward-fill applied: ${forwardFillCount} rows`);
  
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
  
  // Warn if most projects are drafts (indicates possible parsing issue)
  const totalProjects = proyectosCreados + proyectosBorradorIncompleto;
  if (totalProjects > 0 && proyectosBorradorIncompleto > proyectosCreados) {
    console.log(`[Excel Parser] WARNING: More drafts than complete projects. Check if project name column was correctly detected.`);
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
