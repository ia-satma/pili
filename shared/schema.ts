import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, jsonb, index, customType, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Custom BYTEA type for storing binary data (Excel files)
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: Buffer): Buffer {
    return value;
  },
});

// Session storage table - required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table with role - email/password auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("viewer"), // admin, editor, viewer
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Excel Version tracking - each uploaded file gets a version record
export const excelVersions = pgTable("excel_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  fileName: text("file_name").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  fileHash: text("file_hash"),
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  validationErrors: jsonb("validation_errors").$type<string[]>().default([]),
  status: text("status").notNull().default("pending"), // pending, processing, completed, error
});

// Departments catalog
export const departments = pgTable("departments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  code: text("code"),
});

// Main Projects table - aligned with "Formulario de Captura de Iniciativas"
export const projects = pgTable("projects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

  // === IDENTIFICATION ===
  legacyId: text("legacy_id"), // Visual Project Code
  projectName: text("project_name").notNull(), // "Nombre de la iniciativa"
  bpAnalyst: text("bp_analyst"), // "Business Process Analyst"
  departmentName: text("department_name"), // "Negocio/Área" (business_unit)
  region: text("region"), // "Región"
  status: text("status").default("Draft"), // Status

  // === DEFINITION (Core) ===
  problemStatement: text("problem_statement"), // "Problema u oportunidad" (Facts only)
  objective: text("objective"), // "Intención / Urgencia"
  scopeIn: text("scope_in"), // "Qué SÍ incluye"
  scopeOut: text("scope_out"), // "Qué NO incluye"
  description: text("description"), // Legacy - maps to problemStatement

  // === IMPACT & RESOURCES ===
  impactType: jsonb("impact_type").$type<string[]>().default([]), // ['Eficiencia', 'Costos', 'Ingresos', 'Riesgo', 'Otro']
  kpis: text("kpis"), // "Indicadores"
  budget: integer("budget").default(0), // "Requiere presupuesto" in cents/pesos

  // === GOVERNANCE & TEAM ===
  owner: text("owner"), // "Dueño del Proyecto"
  sponsor: text("sponsor"), // "Sponsor"
  leader: text("leader"), // "Líder"
  businessUnit: text("business_unit"), // "Dirección de Negocio"

  // === TIMELINE & STATUS ===
  progress: integer("progress"), // "Progreso" or "%"
  startDate: date("start_date"), // "Fecha Inicio"
  endDate: date("end_date"), // "Fecha Fin"

  // === LEGACY & COMPATIBILITY ===
  responsible: text("responsible"), // Legacy - maps to leader
  endDateEstimated: date("end_date_estimated"), // Legacy compatibility

  // === IMPACT ===
  impactDescription: text("impact_description"), // "Beneficios Estimados"
  estatusAlDia: text("estatus_al_dia"),
  priority: text("priority"),
  category: text("category"),
  projectType: text("project_type"),
  startDateOriginal: text("start_date_original"),
  endDateEstimatedOriginal: text("end_date_estimated_original"),
  endDateEstimatedTbd: boolean("end_date_estimated_tbd").default(false),
  endDateActual: date("end_date_actual"),
  endDateActualOriginal: text("end_date_actual_original"),
  registrationDate: date("registration_date"),
  registrationDateOriginal: text("registration_date_original"),
  percentComplete: integer("percent_complete").default(0),
  statusText: text("status_text"),
  parsedStatus: text("parsed_status"),
  parsedNextSteps: text("parsed_next_steps"),
  benefits: text("benefits"),
  scope: text("scope"), // Legacy - maps to scopeIn
  risks: text("risks"),
  comments: text("comments"),
  lastUpdateText: text("last_update_text"),
  extraFields: jsonb("extra_fields").$type<Record<string, unknown>>().default({}),
  totalValor: integer("total_valor"),
  totalEsfuerzo: integer("total_esfuerzo"),
  puntajeTotal: integer("puntaje_total"),
  ranking: integer("ranking"),
  esBorradorIncompleto: boolean("es_borrador_incompleto").default(false),
  requiereNombre: boolean("requiere_nombre").default(false),
  fechaInvalida: boolean("fecha_invalida").default(false),
  catalogoPendienteMapeo: boolean("catalogo_pendiente_mapeo").default(false),
  dataHealthScore: integer("data_health_score").default(0),
  validationErrors: jsonb("validation_errors").$type<Record<string, string>>().default({}),
  isClean: boolean("is_clean").default(false),

  // === SCORING MATRIX FIELDS ===
  capexTier: text("capex_tier"), // HIGH_COST, MEDIUM_COST, LOW_COST, ZERO_COST
  financialImpact: text("financial_impact"), // HIGH_REVENUE, MEDIUM_REVENUE, LOW_REVENUE, NONE
  strategicFit: text("strategic_fit"), // FULL, PARTIAL, NONE

  // === EXCEL ADDITIONAL FIELDS (from Excel template) ===
  previo: text("previo"), // "Previo"
  cardIdDevops: text("card_id_devops"), // "Card ID DevOps"
  valorDiferenciador: text("valor_diferenciador"), // "Valor / Diferenciador"
  tiempoCicloDias: integer("tiempo_ciclo_dias"), // "T. de Ciclo en días"
  ingresadaEnPbot: text("ingresada_en_pbot"), // "Ingresada en PBOT"
  grupoTecnicoAsignado: text("grupo_tecnico_asignado"), // "Grupo Técnico Asignado"

  // === DEPENDENCIES (Dependencias) ===
  dependenciasItLocal: boolean("dependencias_it_local").default(false), // "Dependencias: IT Local"
  dependenciasTDigital: boolean("dependencias_t_digital").default(false), // "Dependencias: T. Digital"
  dependenciasDigitalizacionSsc: boolean("dependencias_digitalizacion_ssc").default(false), // "Dependencias: Digitalización SSC"
  dependenciasExterno: boolean("dependencias_externo").default(false), // "Dependencias: Externo"

  // === TEAM ROLES ===
  citizenDeveloper: text("citizen_developer"), // "Citizen Developer / Creator"
  dtcLead: text("dtc_lead"), // "DTC Lead"
  blackBeltLead: text("black_belt_lead"), // "Black Belt Lead"

  // === BUSINESS CONTEXT ===
  direccionNegocioUsuario: text("direccion_negocio_usuario"), // "Dirección de Negocio del Usuario"
  impactaGasesEnvasados: text("impacta_gases_envasados"), // "¿Impacta a Gases Envasados?"
  areaProductividad: text("area_productividad"), // "Área de Productividad"

  // === SCORING MATRIX EXTENDED (Matriz de Priorización) ===
  scoringNivelDemanda: text("scoring_nivel_demanda"), // "¿De qué nivel es demanda la necesidad?"
  scoringTieneSponsor: text("scoring_tiene_sponsor"), // "¿Tiene un sponsor o dueño?"
  scoringPersonasAfecta: text("scoring_personas_afecta"), // "¿A cuántas personas afecta?"
  scoringEsReplicable: text("scoring_es_replicable"), // "¿Es replicable?"
  scoringEsEstrategico: text("scoring_es_estrategico"), // "¿Es proyecto estratégico?"
  scoringSimplificaProcesos: text("scoring_simplifica_procesos"), // "¿Simplifica procesos o mejora el control?"
  scoringRecursosExternos: text("scoring_recursos_externos"), // "¿Requiere recursos externos para el desarrollo?"
  scoringTiempoDesarrollo: text("scoring_tiempo_desarrollo"), // "¿Cuál es el tiempo de desarrollo?"
  scoringTiempoImplementar: text("scoring_tiempo_implementar"), // "¿Cuál es el tiempo para implementar?"
  scoringCalidadInformacion: text("scoring_calidad_informacion"), // "¿Cuál es la Calidad de la información?"
  scoringTiempoConseguirInfo: text("scoring_tiempo_conseguir_info"), // "¿Cuál es el Tiempo para conseguir la información?"
  scoringComplejidadTecnica: text("scoring_complejidad_tecnica"), // "¿Qué tan compleja es la implementación técnica?"
  scoringComplejidadCambio: text("scoring_complejidad_cambio"), // "Complejidad del cambio a personas"
  fase: text("fase"), // "Fase"

  // === BUSINESS IMPACT ===
  accionesAcelerar: text("acciones_acelerar"), // "Acciones a ejecutar para Acelerar"
  businessImpactGrowth: text("business_impact_growth"), // "Business Impact USD$ Growth / year Estimated"
  businessImpactCostos: text("business_impact_costos"), // "Business Impact USD$ Costos"
  businessImpactOther: text("business_impact_other"), // "Business Impact (Time, Control, Compliance, Quality of data analysis, data security)"

  // === PMO AUDIT FIELDS ===
  healthScore: integer("health_score").default(100), // 0-100 PMO health score
  auditFlags: jsonb("audit_flags").$type<string[]>().default([]), // List of audit flags/warnings
  // === METADATA CATCH-ALL ===
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}), // Stores all extra fields
  dependencies: text("dependencies"), // "Dependencias"

  // === SYSTEM ===
  sourceVersionId: integer("source_version_id").references(() => excelVersions.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  sourceOrigin: text("source_origin").default('SYSTEM').notNull(), // 'EXCEL_VALIDATED' or 'SYSTEM'
});

// Project milestones/hitos
export const milestones = pgTable("milestones", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  dueDate: date("due_date"),
  dueDateOriginal: text("due_date_original"),
  dueDateTbd: boolean("due_date_tbd").default(false),
  completedDate: date("completed_date"),
  status: text("status"), // Pending, Completed, Overdue
  description: text("description"),
  sourceVersionId: integer("source_version_id").references(() => excelVersions.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Project updates/actualizaciones - S/N timeline entries
export const projectUpdates = pgTable("project_updates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  updateDate: timestamp("update_date").defaultNow().notNull(),
  statusText: text("status_text"), // S: content
  nextStepsText: text("next_steps_text"), // N: content
  rawText: text("raw_text"), // Original unparsed text
  authorName: text("author_name"),
  sourceVersionId: integer("source_version_id").references(() => excelVersions.id),
});

// Change log/bitácora - tracks ALL changes between versions
export const changeLogs = pgTable("change_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").references(() => projects.id),
  versionId: integer("version_id").references(() => excelVersions.id).notNull(),
  previousVersionId: integer("previous_version_id").references(() => excelVersions.id),
  changeType: text("change_type").notNull(), // added, modified, deleted
  fieldName: text("field_name"), // Which field changed
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  legacyId: text("legacy_id"), // For tracking project across versions
  projectName: text("project_name"), // Store name for deleted projects
});

// KPI values for indicators dashboard
export const kpiValues = pgTable("kpi_values", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  versionId: integer("version_id").references(() => excelVersions.id).notNull(),
  kpiName: text("kpi_name").notNull(),
  kpiValue: text("kpi_value").notNull(),
  kpiCategory: text("kpi_category"),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
});

// Chat messages for PMO Bot
export const chatMessages = pgTable("chat_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  role: text("role").notNull(), // user, assistant
  content: text("content").notNull(),
  citations: jsonb("citations").$type<Array<{ sheet?: string; row?: number; column?: string; value?: string }>>().default([]),
  versionContext: integer("version_context").references(() => excelVersions.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Filter presets for projects grid
export const filterPresets = pgTable("filter_presets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<{ search: string; status: string; department: string }>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== H1 Data Foundation Tables =====

// Ingestion batches - tracks file upload sessions
export const ingestionBatches = pgTable("ingestion_batches", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sourceFileHash: text("source_file_hash").notNull(),
  sourceFileName: text("source_file_name").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, committed, failed
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  hardErrorCount: integer("hard_error_count").default(0),
  softErrorCount: integer("soft_error_count").default(0),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Raw artifacts - stores original uploaded files as BYTEA
export const rawArtifacts = pgTable("raw_artifacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  batchId: integer("batch_id").references(() => ingestionBatches.id).notNull(),
  fileContent: bytea("file_content").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  fileHash: text("file_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Validation issues - tracks all hard/soft errors during ingestion
export const validationIssues = pgTable("validation_issues", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  batchId: integer("batch_id").references(() => ingestionBatches.id).notNull(),
  severity: text("severity").notNull(), // "hard" or "soft"
  code: text("code").notNull(), // error code for categorization
  rowNumber: integer("row_number"),
  columnName: text("column_name"),
  rawValue: text("raw_value"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Template versions - tracks Excel template structure changes
export const templateVersions = pgTable("template_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  structureJson: jsonb("structure_json").$type<Record<string, unknown>>().notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Export batches - tracks export operations
export const exportBatches = pgTable("export_batches", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  exportType: text("export_type").notNull(), // excel, pdf, csv
  filterCriteria: jsonb("filter_criteria").$type<Record<string, unknown>>().default({}),
  requestedBy: varchar("requested_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Export artifacts - stores generated export files
export const exportArtifacts = pgTable("export_artifacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  batchId: integer("batch_id").references(() => exportBatches.id).notNull(),
  fileContent: bytea("file_content").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  contentSha256: text("content_sha256"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== H4 Job Queue System (DB-backed autonomy) =====

// Jobs - queue-based background tasks with locking
export const jobs = pgTable("jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobType: text("job_type").notNull(), // GENERATE_EXPORT_EXCEL, GENERATE_COMMITTEE_PACKET, DETECT_LIMBO, DRAFT_CHASERS
  status: text("status").notNull().default("QUEUED"), // QUEUED, RUNNING, SUCCEEDED, FAILED, RETRYING
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  runAt: timestamp("run_at").defaultNow().notNull(),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at"),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("jobs_status_run_at_idx").on(table.status, table.runAt),
]);

// Job runs - execution history for each attempt
export const jobRuns = pgTable("job_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id").references(() => jobs.id).notNull(),
  status: text("status").notNull(), // RUNNING, SUCCEEDED, FAILED
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  metricsJson: jsonb("metrics_json").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
});

// ===== H4 Committee Packets =====

export const committeePackets = pgTable("committee_packets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id").references(() => jobs.id),
  status: text("status").notNull().default("PENDING"), // PENDING, COMPLETED, FAILED
  summaryJson: jsonb("summary_json").$type<{
    generatedAt: string;
    initiativeCount: number;
    initiatives: Array<{
      id: number;
      title: string;
      type: string | null;
      businessUnit: string | null;
      gate: string | null;
      scores: { value: number | null; effort: number | null; total: number | null };
      recentDeltas: Array<{ fieldPath: string; oldValue: string | null; newValue: string | null }>;
      openAlerts: Array<{ signalCode: string; severity: string; rationale: string }>;
      dataQualityScore: number | null;
      recommendedAction: string;
    }>;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== H4 Chaser Drafts =====

export const chaserDrafts = pgTable("chaser_drafts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  initiativeId: integer("initiative_id").references(() => initiatives.id).notNull(),
  alertId: integer("alert_id").references(() => governanceAlerts.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("DRAFT"), // DRAFT, SENT, CANCELLED
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
});

// ===== H2 Canonical Domain Model Tables =====

// Initiatives - canonical master entity
export const initiatives = pgTable("initiatives", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  // Identity resolution fields - at least one should be present
  devopsCardId: text("devops_card_id").unique(), // Azure DevOps card ID
  powerSteeringId: text("power_steering_id").unique(), // PowerSteering ID

  // Core identity (immutable once set)
  title: text("title").notNull(),
  owner: text("owner"),

  // Current state tracking
  currentStatus: text("current_status"), // Latest known status
  isActive: boolean("is_active").default(true),

  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Scoring models - versioned scoring templates
export const scoringModels = pgTable("scoring_models", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Scoring criteria - criteria within a model
export const scoringCriteria = pgTable("scoring_criteria", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  modelId: integer("model_id").references(() => scoringModels.id).notNull(),
  category: text("category").notNull(), // "value" or "effort"
  name: text("name").notNull(),
  weight: integer("weight").default(1),
  displayOrder: integer("display_order").default(0),
  excelColumnName: text("excel_column_name"), // Maps to Excel column
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Scoring options - options for each criterion
export const scoringOptions = pgTable("scoring_options", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  criterionId: integer("criterion_id").references(() => scoringCriteria.id).notNull(),
  label: text("label").notNull(),
  value: integer("value").notNull(), // Numeric score value
  displayOrder: integer("display_order").default(0),
});

// Initiative snapshots - immutable point-in-time snapshots
export const initiativeSnapshots = pgTable("initiative_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  initiativeId: integer("initiative_id").references(() => initiatives.id).notNull(),
  batchId: integer("batch_id").references(() => ingestionBatches.id).notNull(),

  // Snapshot data (copied from Excel row at time of batch)
  title: text("title").notNull(),
  description: text("description"),
  owner: text("owner"),
  sponsor: text("sponsor"),
  departmentName: text("department_name"),
  status: text("status"),
  estatusAlDia: text("estatus_al_dia"),
  priority: text("priority"),
  category: text("category"),
  projectType: text("project_type"),

  // Dates
  startDate: date("start_date"),
  endDateEstimated: date("end_date_estimated"),
  endDateActual: date("end_date_actual"),
  percentComplete: integer("percent_complete"),

  // Scoring (calculated by system)
  totalValor: integer("total_valor"),
  totalEsfuerzo: integer("total_esfuerzo"),
  puntajeTotal: integer("puntaje_total"),
  ranking: integer("ranking"),

  // Excel raw values (for comparison)
  excelTotalValor: integer("excel_total_valor"),
  excelTotalEsfuerzo: integer("excel_total_esfuerzo"),
  excelPuntajeTotal: integer("excel_puntaje_total"),

  // Raw data
  rawExcelRow: jsonb("raw_excel_row").$type<Record<string, unknown>>(),

  // Audit (immutable - never updated)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // DoD requirement: exactly 1 snapshot per initiative per batch
  uniqueIndex("unique_initiative_batch").on(table.initiativeId, table.batchId),
]);

// Assessment entries - scores per criterion per snapshot
export const assessmentEntries = pgTable("assessment_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  snapshotId: integer("snapshot_id").references(() => initiativeSnapshots.id).notNull(),
  criterionId: integer("criterion_id").references(() => scoringCriteria.id).notNull(),
  selectedOptionId: integer("selected_option_id").references(() => scoringOptions.id),
  rawValue: text("raw_value"), // Original Excel value
  numericValue: integer("numeric_value"), // Resolved numeric score
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Benefit records - benefits/impacts
export const benefitRecords = pgTable("benefit_records", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  snapshotId: integer("snapshot_id").references(() => initiativeSnapshots.id).notNull(),
  benefitType: text("benefit_type").notNull(), // efficiency, savings, revenue, etc.
  description: text("description"),
  amount: integer("amount"),
  currency: text("currency").default("MXN"),
  periodicity: text("periodicity"), // annual, monthly, one-time
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Status updates - status change history
export const statusUpdates = pgTable("status_updates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  initiativeId: integer("initiative_id").references(() => initiatives.id).notNull(),
  batchId: integer("batch_id").references(() => ingestionBatches.id),
  statusText: text("status_text"), // S: content
  nextStepsText: text("next_steps_text"), // N: content
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Action items - action items/tasks
export const actionItems = pgTable("action_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  initiativeId: integer("initiative_id").references(() => initiatives.id).notNull(),
  snapshotId: integer("snapshot_id").references(() => initiativeSnapshots.id),
  title: text("title").notNull(),
  assignee: text("assignee"),
  dueDate: date("due_date"),
  status: text("status").default("pending"), // pending, completed, cancelled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// H3 - Delta events - tracks changes between snapshots
export const deltaEvents = pgTable("delta_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  initiativeId: integer("initiative_id").references(() => initiatives.id).notNull(),
  fromSnapshotId: integer("from_snapshot_id").references(() => initiativeSnapshots.id),
  toSnapshotId: integer("to_snapshot_id").references(() => initiativeSnapshots.id).notNull(),
  fieldPath: text("field_path").notNull(), // e.g. "dates.end_date", "scores.total"
  oldValue: text("old_value"),
  newValue: text("new_value"),
  severity: text("severity").notNull().default("INFO"), // INFO, WARN, RISK
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
}, (table) => [
  index("idx_delta_events_initiative").on(table.initiativeId),
  index("idx_delta_events_detected").on(table.detectedAt),
]);

// H3 - Governance alerts - early warning signals
export const governanceAlerts = pgTable("governance_alerts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  initiativeId: integer("initiative_id").references(() => initiatives.id).notNull(),
  signalCode: text("signal_code").notNull(), // ZOMBI, ANGUILA, OPTIMISTA, INDECISO, DRENAJE_DE_VALOR
  severity: text("severity").notNull().default("MEDIUM"), // LOW, MEDIUM, HIGH
  status: text("status").notNull().default("OPEN"), // OPEN, ACKNOWLEDGED, RESOLVED
  rationale: text("rationale"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  relatedSnapshotId: integer("related_snapshot_id").references(() => initiativeSnapshots.id),
  relatedBatchId: integer("related_batch_id").references(() => ingestionBatches.id),
}, (table) => [
  index("idx_governance_alerts_initiative").on(table.initiativeId),
  index("idx_governance_alerts_status").on(table.status),
]);

// ===== H5 Agentic Framework Tables =====

// Agent Definitions - registry of available agents
export const agentDefinitions = pgTable("agent_definitions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").unique().notNull(),
  purpose: text("purpose"),
  inputSchemaJson: jsonb("input_schema_json").$type<Record<string, unknown>>(),
  outputSchemaJson: jsonb("output_schema_json").$type<Record<string, unknown>>(),
  enabled: boolean("enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Agent Versions - versioned prompts with model configuration
export const agentVersions = pgTable("agent_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  agentId: integer("agent_id").references(() => agentDefinitions.id).notNull(),
  version: text("version").notNull(),
  promptTemplate: text("prompt_template"),
  modelProvider: text("model_provider").notNull(), // openai, anthropic, google
  modelName: text("model_name").notNull(), // gpt-4o, claude-3, gemini-pro
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_agent_version_unique").on(table.agentId, table.version),
]);

// Agent Runs - execution records
export const agentRuns = pgTable("agent_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  agentVersionId: integer("agent_version_id").references(() => agentVersions.id).notNull(),
  initiativeId: integer("initiative_id").references(() => initiatives.id),
  initiatedByUserId: varchar("initiated_by_user_id").references(() => users.id),
  status: text("status").notNull().default("QUEUED"), // QUEUED, RUNNING, SUCCEEDED, FAILED, BLOCKED
  inputJson: jsonb("input_json").$type<Record<string, unknown>>(),
  outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
  evidenceRefsJson: jsonb("evidence_refs_json").$type<{ batchIds?: number[]; snapshotIds?: number[] }>(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  tokensJson: jsonb("tokens_json").$type<{ input?: number; output?: number; total?: number }>(),
  costJson: jsonb("cost_json").$type<{ inputCost?: number; outputCost?: number; totalCost?: number }>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_agent_runs_status").on(table.status),
  index("idx_agent_runs_initiative").on(table.initiativeId),
]);

// Council Reviews - review records from CHAIRMAN/CRITIC/QUANT
export const councilReviews = pgTable("council_reviews", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  agentRunId: integer("agent_run_id").references(() => agentRuns.id).notNull(),
  reviewerType: text("reviewer_type").notNull(), // CHAIRMAN, CRITIC, QUANT
  status: text("status").notNull(), // APPROVED, BLOCKED, NEEDS_REVISION
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_council_review_unique").on(table.agentRunId, table.reviewerType),
]);

// System Docs - auto-generated documentation
export const systemDocs = pgTable("system_docs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  docType: text("doc_type").notNull(), // ARCHITECTURE, OPS_MANUAL, AGENT_REGISTRY, DATA_LINEAGE
  contentMarkdown: text("content_markdown"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

// H6 - Download Audit table
export const downloadAudit = pgTable("download_audit", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id"),
  artifactType: text("artifact_type").notNull(), // RAW | EXPORT
  artifactId: integer("artifact_id").notNull(),
  fileName: text("file_name"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== H7 Telemetry Tables =====

// API Telemetry - tracks HTTP API request metrics
export const apiTelemetry = pgTable("api_telemetry", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  durationMs: integer("duration_ms").notNull(),
  userId: text("user_id"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("idx_api_telemetry_endpoint").on(table.endpoint),
  index("idx_api_telemetry_timestamp").on(table.timestamp),
]);

// Agent Telemetry - tracks agent run metrics
export const agentTelemetry = pgTable("agent_telemetry", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  agentName: text("agent_name").notNull(),
  agentRunId: integer("agent_run_id").references(() => agentRuns.id),
  tokensUsed: integer("tokens_used"),
  costUsd: text("cost_usd"), // Stored as text to preserve precision
  durationMs: integer("duration_ms").notNull(),
  status: text("status").notNull(), // SUCCEEDED, FAILED, BLOCKED
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("idx_agent_telemetry_agent_name").on(table.agentName),
  index("idx_agent_telemetry_timestamp").on(table.timestamp),
]);

// Job Telemetry - tracks background job metrics
export const jobTelemetry = pgTable("job_telemetry", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id").references(() => jobs.id),
  jobType: text("job_type").notNull(),
  durationMs: integer("duration_ms").notNull(),
  status: text("status").notNull(), // SUCCEEDED, FAILED
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("idx_job_telemetry_job_type").on(table.jobType),
  index("idx_job_telemetry_timestamp").on(table.timestamp),
]);

// ===== H6.4 Eval Runs Table =====
export const evalRuns = pgTable("eval_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  suiteName: text("suite_name").notNull(),
  fixtureName: text("fixture_name").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(), // PASS | FAIL | ERROR
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  latencyMs: integer("latency_ms"),
  notes: text("notes"),
  inputJson: jsonb("input_json").$type<Record<string, unknown>>(),
  outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
});

// Relations
export const excelVersionsRelations = relations(excelVersions, ({ many }) => ({
  projects: many(projects),
  changeLogs: many(changeLogs),
  kpiValues: many(kpiValues),
  chatMessages: many(chatMessages),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  sourceVersion: one(excelVersions, {
    fields: [projects.sourceVersionId],
    references: [excelVersions.id],
  }),
  milestones: many(milestones),
  updates: many(projectUpdates),
  changeLogs: many(changeLogs),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
  sourceVersion: one(excelVersions, {
    fields: [milestones.sourceVersionId],
    references: [excelVersions.id],
  }),
}));

export const projectUpdatesRelations = relations(projectUpdates, ({ one }) => ({
  project: one(projects, {
    fields: [projectUpdates.projectId],
    references: [projects.id],
  }),
  sourceVersion: one(excelVersions, {
    fields: [projectUpdates.sourceVersionId],
    references: [excelVersions.id],
  }),
}));

export const changeLogsRelations = relations(changeLogs, ({ one }) => ({
  project: one(projects, {
    fields: [changeLogs.projectId],
    references: [projects.id],
  }),
  version: one(excelVersions, {
    fields: [changeLogs.versionId],
    references: [excelVersions.id],
  }),
}));

export const kpiValuesRelations = relations(kpiValues, ({ one }) => ({
  version: one(excelVersions, {
    fields: [kpiValues.versionId],
    references: [excelVersions.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  version: one(excelVersions, {
    fields: [chatMessages.versionContext],
    references: [excelVersions.id],
  }),
}));

// H1 Data Foundation Relations
export const ingestionBatchesRelations = relations(ingestionBatches, ({ one, many }) => ({
  uploadedByUser: one(users, {
    fields: [ingestionBatches.uploadedBy],
    references: [users.id],
  }),
  rawArtifacts: many(rawArtifacts),
  validationIssues: many(validationIssues),
}));

export const rawArtifactsRelations = relations(rawArtifacts, ({ one }) => ({
  batch: one(ingestionBatches, {
    fields: [rawArtifacts.batchId],
    references: [ingestionBatches.id],
  }),
}));

export const validationIssuesRelations = relations(validationIssues, ({ one }) => ({
  batch: one(ingestionBatches, {
    fields: [validationIssues.batchId],
    references: [ingestionBatches.id],
  }),
}));

export const exportBatchesRelations = relations(exportBatches, ({ one, many }) => ({
  requestedByUser: one(users, {
    fields: [exportBatches.requestedBy],
    references: [users.id],
  }),
  exportArtifacts: many(exportArtifacts),
}));

export const exportArtifactsRelations = relations(exportArtifacts, ({ one }) => ({
  batch: one(exportBatches, {
    fields: [exportArtifacts.batchId],
    references: [exportBatches.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ many }) => ({
  runs: many(jobRuns),
}));

export const jobRunsRelations = relations(jobRuns, ({ one }) => ({
  job: one(jobs, {
    fields: [jobRuns.jobId],
    references: [jobs.id],
  }),
}));

// H2 Canonical Domain Model Relations
export const initiativesRelations = relations(initiatives, ({ many }) => ({
  snapshots: many(initiativeSnapshots),
  statusUpdates: many(statusUpdates),
  actionItems: many(actionItems),
}));

export const scoringModelsRelations = relations(scoringModels, ({ many }) => ({
  criteria: many(scoringCriteria),
}));

export const scoringCriteriaRelations = relations(scoringCriteria, ({ one, many }) => ({
  model: one(scoringModels, {
    fields: [scoringCriteria.modelId],
    references: [scoringModels.id],
  }),
  options: many(scoringOptions),
  assessmentEntries: many(assessmentEntries),
}));

export const scoringOptionsRelations = relations(scoringOptions, ({ one, many }) => ({
  criterion: one(scoringCriteria, {
    fields: [scoringOptions.criterionId],
    references: [scoringCriteria.id],
  }),
  assessmentEntries: many(assessmentEntries),
}));

export const initiativeSnapshotsRelations = relations(initiativeSnapshots, ({ one, many }) => ({
  initiative: one(initiatives, {
    fields: [initiativeSnapshots.initiativeId],
    references: [initiatives.id],
  }),
  batch: one(ingestionBatches, {
    fields: [initiativeSnapshots.batchId],
    references: [ingestionBatches.id],
  }),
  assessmentEntries: many(assessmentEntries),
  benefitRecords: many(benefitRecords),
  actionItems: many(actionItems),
}));

export const assessmentEntriesRelations = relations(assessmentEntries, ({ one }) => ({
  snapshot: one(initiativeSnapshots, {
    fields: [assessmentEntries.snapshotId],
    references: [initiativeSnapshots.id],
  }),
  criterion: one(scoringCriteria, {
    fields: [assessmentEntries.criterionId],
    references: [scoringCriteria.id],
  }),
  selectedOption: one(scoringOptions, {
    fields: [assessmentEntries.selectedOptionId],
    references: [scoringOptions.id],
  }),
}));

export const benefitRecordsRelations = relations(benefitRecords, ({ one }) => ({
  snapshot: one(initiativeSnapshots, {
    fields: [benefitRecords.snapshotId],
    references: [initiativeSnapshots.id],
  }),
}));

export const statusUpdatesRelations = relations(statusUpdates, ({ one }) => ({
  initiative: one(initiatives, {
    fields: [statusUpdates.initiativeId],
    references: [initiatives.id],
  }),
  batch: one(ingestionBatches, {
    fields: [statusUpdates.batchId],
    references: [ingestionBatches.id],
  }),
  updatedByUser: one(users, {
    fields: [statusUpdates.updatedBy],
    references: [users.id],
  }),
}));

export const actionItemsRelations = relations(actionItems, ({ one }) => ({
  initiative: one(initiatives, {
    fields: [actionItems.initiativeId],
    references: [initiatives.id],
  }),
  snapshot: one(initiativeSnapshots, {
    fields: [actionItems.snapshotId],
    references: [initiativeSnapshots.id],
  }),
}));

// Insert schemas - using type assertion to work around drizzle-zod omit() TypeScript bug
// See: https://github.com/drizzle-team/drizzle-orm/issues/4016
export const insertExcelVersionSchema = createInsertSchema(excelVersions).omit({ id: true, uploadedAt: true } as Record<string, true>);
export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true } as Record<string, true>);
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true } as Record<string, true>);
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertProjectUpdateSchema = createInsertSchema(projectUpdates).omit({ id: true } as Record<string, true>);
export const insertChangeLogSchema = createInsertSchema(changeLogs).omit({ id: true, changedAt: true } as Record<string, true>);
export const insertKpiValueSchema = createInsertSchema(kpiValues).omit({ id: true, calculatedAt: true } as Record<string, true>);
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertFilterPresetSchema = createInsertSchema(filterPresets).omit({ id: true, createdAt: true } as Record<string, true>);

// H1 Data Foundation Insert Schemas
export const insertIngestionBatchSchema = createInsertSchema(ingestionBatches).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertRawArtifactSchema = createInsertSchema(rawArtifacts).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertValidationIssueSchema = createInsertSchema(validationIssues).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertTemplateVersionSchema = createInsertSchema(templateVersions).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertExportBatchSchema = createInsertSchema(exportBatches).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertExportArtifactSchema = createInsertSchema(exportArtifacts).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertJobRunSchema = createInsertSchema(jobRuns).omit({ id: true, startedAt: true } as Record<string, true>);

// H2 Canonical Domain Model Insert Schemas
export const insertInitiativeSchema = createInsertSchema(initiatives).omit({ id: true, createdAt: true, updatedAt: true } as Record<string, true>);
export const insertScoringModelSchema = createInsertSchema(scoringModels).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertScoringCriterionSchema = createInsertSchema(scoringCriteria).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertScoringOptionSchema = createInsertSchema(scoringOptions).omit({ id: true } as Record<string, true>);
export const insertInitiativeSnapshotSchema = createInsertSchema(initiativeSnapshots).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertAssessmentEntrySchema = createInsertSchema(assessmentEntries).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertBenefitRecordSchema = createInsertSchema(benefitRecords).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertStatusUpdateSchema = createInsertSchema(statusUpdates).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertActionItemSchema = createInsertSchema(actionItems).omit({ id: true, createdAt: true } as Record<string, true>);

// H3 Delta Engine Insert Schemas
export const insertDeltaEventSchema = createInsertSchema(deltaEvents).omit({ id: true, detectedAt: true } as Record<string, true>);
export const insertGovernanceAlertSchema = createInsertSchema(governanceAlerts).omit({ id: true, detectedAt: true } as Record<string, true>);

// H4 Job Queue Insert Schemas
export const insertCommitteePacketSchema = createInsertSchema(committeePackets).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertChaserDraftSchema = createInsertSchema(chaserDrafts).omit({ id: true, createdAt: true } as Record<string, true>);

// H5 Agentic Framework Insert Schemas
export const insertAgentDefinitionSchema = createInsertSchema(agentDefinitions).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertAgentVersionSchema = createInsertSchema(agentVersions).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertAgentRunSchema = createInsertSchema(agentRuns).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertCouncilReviewSchema = createInsertSchema(councilReviews).omit({ id: true, createdAt: true } as Record<string, true>);
export const insertSystemDocSchema = createInsertSchema(systemDocs).omit({ id: true, generatedAt: true } as Record<string, true>);

// H6 Download Audit Insert Schema
export const insertDownloadAuditSchema = createInsertSchema(downloadAudit).omit({ id: true, createdAt: true } as Record<string, true>);

// H6.4 Eval Runs
export const insertEvalRunSchema = createInsertSchema(evalRuns).omit({ id: true } as Record<string, true>);

// H7 Telemetry Insert Schemas
export const insertApiTelemetrySchema = createInsertSchema(apiTelemetry).omit({ id: true, timestamp: true } as Record<string, true>);
export const insertAgentTelemetrySchema = createInsertSchema(agentTelemetry).omit({ id: true, timestamp: true } as Record<string, true>);
export const insertJobTelemetrySchema = createInsertSchema(jobTelemetry).omit({ id: true, timestamp: true } as Record<string, true>);

// Types
export type ExcelVersion = typeof excelVersions.$inferSelect;
export type InsertExcelVersion = z.infer<typeof insertExcelVersionSchema>;
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Milestone = typeof milestones.$inferSelect;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type ProjectUpdate = typeof projectUpdates.$inferSelect;
export type InsertProjectUpdate = z.infer<typeof insertProjectUpdateSchema>;
export type ChangeLog = typeof changeLogs.$inferSelect;
export type InsertChangeLog = z.infer<typeof insertChangeLogSchema>;
export type KpiValue = typeof kpiValues.$inferSelect;
export type InsertKpiValue = z.infer<typeof insertKpiValueSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type FilterPreset = typeof filterPresets.$inferSelect;
export type InsertFilterPreset = z.infer<typeof insertFilterPresetSchema>;

// H1 Data Foundation Types
export type IngestionBatch = typeof ingestionBatches.$inferSelect;
export type InsertIngestionBatch = z.infer<typeof insertIngestionBatchSchema>;
export type RawArtifact = typeof rawArtifacts.$inferSelect;
export type InsertRawArtifact = z.infer<typeof insertRawArtifactSchema>;
export type ValidationIssue = typeof validationIssues.$inferSelect;
export type InsertValidationIssue = z.infer<typeof insertValidationIssueSchema>;
export type TemplateVersion = typeof templateVersions.$inferSelect;
export type InsertTemplateVersion = z.infer<typeof insertTemplateVersionSchema>;
export type ExportBatch = typeof exportBatches.$inferSelect;
export type InsertExportBatch = z.infer<typeof insertExportBatchSchema>;
export type ExportArtifact = typeof exportArtifacts.$inferSelect;
export type InsertExportArtifact = z.infer<typeof insertExportArtifactSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type JobRun = typeof jobRuns.$inferSelect;
export type InsertJobRun = z.infer<typeof insertJobRunSchema>;

// H2 Canonical Domain Model Types
export type Initiative = typeof initiatives.$inferSelect;
export type InsertInitiative = z.infer<typeof insertInitiativeSchema>;
export type ScoringModel = typeof scoringModels.$inferSelect;
export type InsertScoringModel = z.infer<typeof insertScoringModelSchema>;
export type ScoringCriterion = typeof scoringCriteria.$inferSelect;
export type InsertScoringCriterion = z.infer<typeof insertScoringCriterionSchema>;
export type ScoringOption = typeof scoringOptions.$inferSelect;
export type InsertScoringOption = z.infer<typeof insertScoringOptionSchema>;
export type InitiativeSnapshot = typeof initiativeSnapshots.$inferSelect;
export type InsertInitiativeSnapshot = z.infer<typeof insertInitiativeSnapshotSchema>;
export type AssessmentEntry = typeof assessmentEntries.$inferSelect;
export type InsertAssessmentEntry = z.infer<typeof insertAssessmentEntrySchema>;
export type BenefitRecord = typeof benefitRecords.$inferSelect;
export type InsertBenefitRecord = z.infer<typeof insertBenefitRecordSchema>;
export type StatusUpdate = typeof statusUpdates.$inferSelect;
export type InsertStatusUpdate = z.infer<typeof insertStatusUpdateSchema>;
export type ActionItem = typeof actionItems.$inferSelect;
export type InsertActionItem = z.infer<typeof insertActionItemSchema>;

// H3 Delta Engine Types
export type DeltaEvent = typeof deltaEvents.$inferSelect;
export type InsertDeltaEvent = z.infer<typeof insertDeltaEventSchema>;
export type GovernanceAlert = typeof governanceAlerts.$inferSelect;
export type InsertGovernanceAlert = z.infer<typeof insertGovernanceAlertSchema>;

// H4 Job Queue Types
export type CommitteePacket = typeof committeePackets.$inferSelect;
export type InsertCommitteePacket = z.infer<typeof insertCommitteePacketSchema>;
export type ChaserDraft = typeof chaserDrafts.$inferSelect;
export type InsertChaserDraft = z.infer<typeof insertChaserDraftSchema>;

// H5 Agentic Framework Types
export type AgentDefinition = typeof agentDefinitions.$inferSelect;
export type InsertAgentDefinition = z.infer<typeof insertAgentDefinitionSchema>;
export type AgentVersion = typeof agentVersions.$inferSelect;
export type InsertAgentVersion = z.infer<typeof insertAgentVersionSchema>;
export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;
export type CouncilReview = typeof councilReviews.$inferSelect;
export type InsertCouncilReview = z.infer<typeof insertCouncilReviewSchema>;
export type SystemDoc = typeof systemDocs.$inferSelect;
export type InsertSystemDoc = z.infer<typeof insertSystemDocSchema>;

// H6 Download Audit Types
export type DownloadAudit = typeof downloadAudit.$inferSelect;
export type InsertDownloadAudit = z.infer<typeof insertDownloadAuditSchema>;

// H6.4 Eval Runs Types
export type EvalRun = typeof evalRuns.$inferSelect;
export type InsertEvalRun = z.infer<typeof insertEvalRunSchema>;

// H7 Telemetry Types
export type ApiTelemetry = typeof apiTelemetry.$inferSelect;
export type InsertApiTelemetry = z.infer<typeof insertApiTelemetrySchema>;
export type AgentTelemetry = typeof agentTelemetry.$inferSelect;
export type InsertAgentTelemetry = z.infer<typeof insertAgentTelemetrySchema>;
export type JobTelemetry = typeof jobTelemetry.$inferSelect;
export type InsertJobTelemetry = z.infer<typeof insertJobTelemetrySchema>;

// Output Runs - tracks generated artifacts per ingestion batch
export const outputRuns = pgTable("output_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  batchId: integer("batch_id").references(() => ingestionBatches.id),
  jobId: integer("job_id").references(() => jobs.id),
  jobType: text("job_type").notNull(),
  artifactId: integer("artifact_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertOutputRunSchema = createInsertSchema(outputRuns).omit({ id: true });
export type OutputRun = typeof outputRuns.$inferSelect;
export type InsertOutputRun = z.infer<typeof insertOutputRunSchema>;

// ===== Chaser Notifications Table =====

export const chaserNotifications = pgTable("chaser_notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  recipientEmail: text("recipient_email"),
  recipientName: text("recipient_name"),
  message: text("message").notNull(),
  status: text("status").notNull().default("pending"), // pending, sent, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
});

export const insertChaserNotificationSchema = createInsertSchema(chaserNotifications).omit({ id: true });
export type ChaserNotification = typeof chaserNotifications.$inferSelect;
export type InsertChaserNotification = z.infer<typeof insertChaserNotificationSchema>;

// Traffic light status enum for frontend
export type TrafficLightStatus = 'green' | 'yellow' | 'red' | 'gray';

// Extended project type with computed fields
export type ProjectWithStatus = Project & {
  trafficLight: TrafficLightStatus;
  daysUntilDue?: number;
  isOverdue: boolean;
};
