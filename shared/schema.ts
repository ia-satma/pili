import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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

// User storage table with role - required for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
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

// Insert schemas
export const insertExcelVersionSchema = createInsertSchema(excelVersions).omit({ id: true, uploadedAt: true });
export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true, createdAt: true });
export const insertProjectUpdateSchema = createInsertSchema(projectUpdates).omit({ id: true });
export const insertChangeLogSchema = createInsertSchema(changeLogs).omit({ id: true, changedAt: true });
export const insertKpiValueSchema = createInsertSchema(kpiValues).omit({ id: true, calculatedAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export const insertFilterPresetSchema = createInsertSchema(filterPresets).omit({ id: true, createdAt: true });

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

// Traffic light status enum for frontend
export type TrafficLightStatus = 'green' | 'yellow' | 'red' | 'gray';

// Extended project type with computed fields
export type ProjectWithStatus = Project & {
  trafficLight: TrafficLightStatus;
  daysUntilDue?: number;
  isOverdue: boolean;
};
