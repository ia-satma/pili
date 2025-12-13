import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, jsonb, index, customType } from "drizzle-orm/pg-core";
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

// Main Projects table - maps ALL Excel columns
export const projects = pgTable("projects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  legacyId: text("legacy_id"), // Original ID from Excel for traceability
  
  // Core fields
  projectName: text("project_name").notNull(),
  description: text("description"),
  departmentId: integer("department_id").references(() => departments.id),
  departmentName: text("department_name"), // Keep original text as well
  responsible: text("responsible"),
  sponsor: text("sponsor"),
  
  // Status fields
  status: text("status"), // Open, Closed, On Hold, etc.
  estatusAlDia: text("estatus_al_dia"), // From Excel column "ESTATUS AL DÍA" - On time, Delayed, etc.
  priority: text("priority"), // High, Medium, Low
  category: text("category"),
  projectType: text("project_type"),
  
  // Dates - all preserved as original text to avoid interpretation
  startDate: date("start_date"),
  startDateOriginal: text("start_date_original"), // Original Excel value
  endDateEstimated: date("end_date_estimated"),
  endDateEstimatedOriginal: text("end_date_estimated_original"),
  endDateEstimatedTbd: boolean("end_date_estimated_tbd").default(false), // TBD flag
  endDateActual: date("end_date_actual"),
  endDateActualOriginal: text("end_date_actual_original"),
  registrationDate: date("registration_date"),
  registrationDateOriginal: text("registration_date_original"),
  
  // Progress
  percentComplete: integer("percent_complete").default(0),
  
  // Status/Next Steps parsed fields
  statusText: text("status_text"), // Full original S/N text
  parsedStatus: text("parsed_status"), // Extracted S: portion
  parsedNextSteps: text("parsed_next_steps"), // Extracted N: portion
  
  // Additional Excel columns (keep ALL original data)
  benefits: text("benefits"),
  scope: text("scope"),
  risks: text("risks"),
  comments: text("comments"),
  lastUpdateText: text("last_update_text"),
  
  // Extra fields stored as JSON for any unmapped columns
  extraFields: jsonb("extra_fields").$type<Record<string, unknown>>().default({}),
  
  // PMO Scoring fields (from Excel columns AA-AO)
  totalValor: integer("total_valor"), // Strategic value score (300-500)
  totalEsfuerzo: integer("total_esfuerzo"), // Execution ease score (400-510, higher = less effort)
  puntajeTotal: integer("puntaje_total"), // Total score (totalValor + totalEsfuerzo)
  ranking: integer("ranking"), // Prioritization order
  
  // Draft project flags for soft errors
  esBorradorIncompleto: boolean("es_borrador_incompleto").default(false),
  requiereNombre: boolean("requiere_nombre").default(false),
  fechaInvalida: boolean("fecha_invalida").default(false),
  catalogoPendienteMapeo: boolean("catalogo_pendiente_mapeo").default(false),
  
  // Tracking
  sourceVersionId: integer("source_version_id").references(() => excelVersions.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  citations: jsonb("citations").$type<Array<{sheet?: string; row?: number; column?: string; value?: string}>>().default([]),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Jobs - scheduled background tasks
export const jobs = pgTable("jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  jobType: text("job_type").notNull(),
  cronExpression: text("cron_expression"),
  isEnabled: boolean("is_enabled").default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Job runs - execution history for scheduled jobs
export const jobRuns = pgTable("job_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id").references(() => jobs.id).notNull(),
  status: text("status").notNull(), // pending, running, completed, failed
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  resultSummary: jsonb("result_summary").$type<Record<string, unknown>>(),
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
  department: one(departments, {
    fields: [projects.departmentId],
    references: [departments.id],
  }),
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

// Traffic light status enum for frontend
export type TrafficLightStatus = 'green' | 'yellow' | 'red' | 'gray';

// Extended project type with computed fields
export type ProjectWithStatus = Project & {
  trafficLight: TrafficLightStatus;
  daysUntilDue?: number;
  isOverdue: boolean;
};
