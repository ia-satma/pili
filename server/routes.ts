import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import crypto from "crypto";
import { z } from "zod";
import * as XLSX from "xlsx";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { storage } from "./storage";
import { db } from "./db";
import { desc, eq } from "drizzle-orm";
import { parseExcelBuffer, type ParsedProject } from "./excel-parser";
import { generatePMOBotResponse, type ChatContext, isOpenAIConfigured } from "./openai";
import type { InsertChangeLog, InsertKpiValue, Project, InsertProject, InsertValidationIssue } from "@shared/schema";
import { exportBatches, jobs, jobRuns } from "@shared/schema";
import { setupAuth, isAuthenticated, isAdmin, isEditor, isViewer, seedAdminUsers } from "./replitAuth";
import { enqueueJob } from "./services/workerLoop";
import { agentRateLimit, exportRateLimit, uploadRateLimit, systemDocsRateLimit } from "./middleware/rateLimiter";
import { telemetryMiddleware } from "./middleware/telemetryMiddleware";
import { runOrchestrator } from "./services/orchestrator";
import { normalizeKey, normalizedEquals, normalizedIncludes } from "./services/normalization";
import { getCurrentPortfolioView } from "./services/portfolioView";
import { routePmoQuery, isDeterministicRoute } from "./services/pmoQueryRouter";
import { generateDeterministicAnswer, generateOwnerDelayedProjectsAnswer, type OwnerDelayedProjectsAnswer } from "./services/pmoDeterministicAnswer";
import { isCircuitOpen, recordSuccess, recordFailure, getCircuitStatus, getLlmTimeoutMs, withTimeout } from "./services/circuitBreaker";
import { runFullAudit, getHealthStats, getDirtyProjects, validateAndUpdateProject } from "./services/data-validator";
import { auditAllProjects, auditSingleProject } from "./services/auditor";
import { enrichProjectMetadata } from "./services/enricher";

// Validation schemas
const sendMessageSchema = z.object({
  content: z.string().min(1, "El mensaje no puede estar vacío").max(2000, "El mensaje es demasiado largo"),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.number()).min(1, "Debe seleccionar al menos un proyecto"),
  field: z.enum(["status", "priority", "responsible"], {
    errorMap: () => ({ message: "Campo no válido" }),
  }),
  value: z.string().min(1, "El valor no puede estar vacío"),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.number()).min(1, "Debe seleccionar al menos un proyecto"),
});

// Orchestrator request schema
const orchestratorRequestSchema = z.object({
  initiativeId: z.number().optional(),
  message: z.string().min(1, "El mensaje no puede estar vacío").max(2000, "El mensaje es demasiado largo"),
  mode: z.enum(["BRAINSTORM", "DECIDE", "RISKS", "NEXT_ACTIONS"]),
});

// Schema for creating individual projects (aligned with new schema fields)
const createProjectSchema = z.object({
  // Identification
  projectName: z.string().min(1, "Nombre del proyecto es requerido"),
  bpAnalyst: z.string().optional().nullable(),
  departmentName: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  status: z.string().default("Draft"),

  // Definition (Core)
  problemStatement: z.string().optional().nullable(),
  objective: z.string().optional().nullable(),
  scopeIn: z.string().optional().nullable(),
  scopeOut: z.string().optional().nullable(),
  description: z.string().optional().nullable(), // Legacy

  // Impact & Resources
  impactType: z.array(z.string()).default([]),
  kpis: z.string().optional().nullable(),
  budget: z.number().min(0).default(0),

  // Governance
  sponsor: z.string().optional().nullable(),
  leader: z.string().optional().nullable(),
  responsible: z.string().optional().nullable(), // Legacy
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  endDateEstimated: z.string().optional().nullable(), // Legacy

  // Legacy fields
  priority: z.string().default("Media"),
  category: z.string().optional().nullable(),
  projectType: z.string().optional().nullable(),
  endDateEstimatedTbd: z.boolean().default(false),
  endDateActual: z.string().optional().nullable(),
  percentComplete: z.number().min(0).max(100).default(0),
  statusText: z.string().optional().nullable(),
  parsedStatus: z.string().optional().nullable(),
  parsedNextSteps: z.string().optional().nullable(),
  benefits: z.string().optional().nullable(),
  scope: z.string().optional().nullable(), // Legacy
  risks: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith(".xlsx") || file.originalname.endsWith(".xls")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only Excel files are allowed."));
    }
  },
});

// Calculate traffic light status
// Priority: estatusAlDia (from Excel) > calculated from dates
function calculateTrafficLight(
  endDateEstimated: string | null | undefined,
  endDateEstimatedTbd: boolean | null | undefined,
  status: string | null | undefined,
  estatusAlDia?: string | null | undefined
): "green" | "yellow" | "red" | "gray" {
  // PRIORITY 1: Use "ESTATUS AL DÍA" from Excel if available
  if (estatusAlDia) {
    const lower = estatusAlDia.toLowerCase().trim();

    // GREEN: On time, completado
    if (lower === "on time" || lower === "a tiempo" || lower === "en tiempo") {
      return "green";
    }

    // RED: Any risk or overdue variant
    if (lower.includes("riesgo") || lower.includes("vencido") || lower === "delayed" || lower === "retrasado" || lower === "at risk") {
      return "red";
    }

    // GRAY: Not started, cancelled, stand by
    if (lower === "no iniciado" || lower === "not started" || lower === "pending" ||
      lower === "cancelado" || lower === "cancelled" || lower === "stand by" || lower === "standby") {
      return "gray";
    }

    // If estatusAlDia has a value but doesn't match known patterns, treat as yellow
    if (lower.length > 0) {
      return "yellow";
    }
  }

  // FALLBACK: Calculate from dates if no estatusAlDia
  if (endDateEstimatedTbd || !endDateEstimated) {
    return "gray";
  }

  const lowerStatus = status?.toLowerCase() || "";
  if (lowerStatus === "cerrado" || lowerStatus === "closed" || lowerStatus === "terminado") {
    return "green";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(endDateEstimated);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "red";
  if (diffDays <= 7) return "yellow";
  return "green";
}

// Compare projects and generate change logs
function compareProjects(
  oldProject: Project | null,
  newData: ParsedProject,
  versionId: number,
  previousVersionId: number | null
): InsertChangeLog[] {
  const changes: InsertChangeLog[] = [];

  if (!oldProject) {
    // New project
    changes.push({
      projectId: null,
      versionId,
      previousVersionId,
      changeType: "added",
      fieldName: null,
      oldValue: null,
      newValue: newData.projectName || null,
      legacyId: newData.legacyId || null,
      projectName: newData.projectName || null,
    });
    return changes;
  }

  // Compare fields - keys that exist in both Project and ParsedProject
  const fieldsToCompare = [
    "projectName", "description", "departmentName", "responsible",
    "sponsor", "status", "priority", "category", "projectType",
    "startDate", "endDateEstimated", "endDateActual", "registrationDate",
    "percentComplete", "statusText", "parsedStatus", "parsedNextSteps",
    "benefits", "scope", "risks", "comments"
  ] as const;

  for (const field of fieldsToCompare) {
    const oldVal = oldProject[field as keyof Project];
    const newVal = newData[field as keyof ParsedProject];

    // Normalize for comparison
    const oldStr = oldVal === null || oldVal === undefined ? "" : String(oldVal);
    const newStr = newVal === null || newVal === undefined ? "" : String(newVal);

    if (oldStr !== newStr) {
      changes.push({
        projectId: oldProject.id,
        versionId,
        previousVersionId,
        changeType: "modified",
        fieldName: field,
        oldValue: oldStr || null,
        newValue: newStr || null,
        legacyId: oldProject.legacyId,
        projectName: oldProject.projectName,
      });
    }
  }

  return changes;
}

// Calculate KPIs from projects
function calculateKpis(projects: Project[], versionId: number): InsertKpiValue[] {
  const kpis: InsertKpiValue[] = [];

  // Total projects
  kpis.push({
    versionId,
    kpiName: "Total Proyectos",
    kpiValue: String(projects.length),
    kpiCategory: "General",
  });

  // By status
  const statusCounts: Record<string, number> = {};
  let openCount = 0;
  let closedCount = 0;

  projects.forEach(p => {
    const status = p.status || "Sin estado";
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const lower = status.toLowerCase();
    if (lower === "cerrado" || lower === "closed" || lower === "completado") {
      closedCount++;
    } else if (lower !== "cancelado" && lower !== "cancelled") {
      openCount++;
    }
  });

  kpis.push({
    versionId,
    kpiName: "Proyectos Abiertos",
    kpiValue: String(openCount),
    kpiCategory: "Estado",
  });

  kpis.push({
    versionId,
    kpiName: "Proyectos Cerrados",
    kpiValue: String(closedCount),
    kpiCategory: "Estado",
  });

  // Traffic light counts
  let greenCount = 0, yellowCount = 0, redCount = 0, grayCount = 0;

  projects.forEach(p => {
    const light = calculateTrafficLight(p.endDateEstimated, p.endDateEstimatedTbd, p.status, p.estatusAlDia);
    if (light === "green") greenCount++;
    else if (light === "yellow") yellowCount++;
    else if (light === "red") redCount++;
    else grayCount++;
  });

  kpis.push({
    versionId,
    kpiName: "En Tiempo",
    kpiValue: String(greenCount),
    kpiCategory: "Semáforo",
  });

  kpis.push({
    versionId,
    kpiName: "Próximos a Vencer",
    kpiValue: String(yellowCount),
    kpiCategory: "Semáforo",
  });

  kpis.push({
    versionId,
    kpiName: "Vencidos",
    kpiValue: String(redCount),
    kpiCategory: "Semáforo",
  });

  // By department
  const deptCounts: Record<string, number> = {};
  projects.forEach(p => {
    const dept = p.departmentName || "Sin departamento";
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  Object.entries(deptCounts).forEach(([dept, count]) => {
    kpis.push({
      versionId,
      kpiName: dept,
      kpiValue: String(count),
      kpiCategory: "Departamento",
    });
  });

  // Average completion
  const totalCompletion = projects.reduce((sum, p) => sum + (p.percentComplete || 0), 0);
  const avgCompletion = projects.length > 0 ? Math.round(totalCompletion / projects.length) : 0;

  kpis.push({
    versionId,
    kpiName: "Avance Promedio",
    kpiValue: `${avgCompletion}%`,
    kpiCategory: "Progreso",
  });

  // On-time delivery rate (closed projects that finished on time)
  const closedProjects = projects.filter(p => {
    const lower = (p.status || "").toLowerCase();
    return lower === "cerrado" || lower === "closed" || lower === "completado";
  });

  const onTimeCount = closedProjects.filter(p => {
    if (!p.endDateEstimated || !p.endDateActual) return true;
    return new Date(p.endDateActual) <= new Date(p.endDateEstimated);
  }).length;

  const onTimeRate = closedProjects.length > 0
    ? Math.round((onTimeCount / closedProjects.length) * 100)
    : 100;

  kpis.push({
    versionId,
    kpiName: "Entrega a Tiempo",
    kpiValue: `${onTimeRate}%`,
    kpiCategory: "Rendimiento",
  });

  return kpis;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ===== AUTH SETUP =====
  await setupAuth(app);
  await seedAdminUsers();

  // ===== TELEMETRY MIDDLEWARE =====
  app.use("/api", telemetryMiddleware);

  // ===== AUTH ROUTES =====
  app.get("/api/auth/user", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "No autorizado" });
      }
      const authenticatedUser = req.user as Express.User;
      const userId = authenticatedUser.id;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error instanceof Error ? error.message : String(error));
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ===== ADMIN ROUTES =====
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json({ users });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Error loading users" });
    }
  });

  app.patch("/api/admin/users/:id/role", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!["admin", "editor", "viewer"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const user = await storage.updateUserRole(id, role);
      res.json({ user });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Error updating user role" });
    }
  });

  // ===== ADMIN PURGE (HARD RESET) =====
  app.delete("/api/admin/purge-all", isAuthenticated, isAdmin, async (req, res) => {
    try {
      console.log("Starting database purge...");

      // Import all necessary schemas for deletion
      const {
        changeLogs, projectUpdates, milestones, projects, kpiValues, chatMessages,
        chaserDrafts, assessmentEntries, benefitRecords, actionItems, deltaEvents,
        statusUpdates, governanceAlerts, initiativeSnapshots, initiatives,
        rawArtifacts, validationIssues, ingestionBatches, excelVersions,
        exportArtifacts, exportBatches, jobRuns, committeePackets, jobs, departments, filterPresets
      } = await import("@shared/schema");

      // Delete in order respecting foreign key constraints (leaf tables first)
      // Phase 1: Tables with no dependents
      await db.delete(changeLogs);
      await db.delete(projectUpdates);
      await db.delete(milestones);
      await db.delete(kpiValues);
      await db.delete(chatMessages);
      await db.delete(filterPresets);

      // Phase 2: Chaser drafts (references governance_alerts and initiatives)
      await db.delete(chaserDrafts);

      // Phase 3: Assessment/benefit/action/status records (reference initiative_snapshots)
      await db.delete(assessmentEntries);
      await db.delete(benefitRecords);
      await db.delete(actionItems);
      await db.delete(statusUpdates);
      await db.delete(deltaEvents);

      // Phase 4: Governance alerts (references initiative_snapshots)
      await db.delete(governanceAlerts);

      // Phase 5: Initiative snapshots (references initiatives and ingestion_batches)
      await db.delete(initiativeSnapshots);

      // Phase 6: Projects (references departments and excel_versions)
      await db.delete(projects);

      // Phase 7: Initiatives (no more dependents)
      await db.delete(initiatives);

      // Phase 8: Raw artifacts and validation issues (reference ingestion_batches)
      await db.delete(rawArtifacts);
      await db.delete(validationIssues);

      // Phase 9: Ingestion batches
      await db.delete(ingestionBatches);

      // Phase 10: Excel versions
      await db.delete(excelVersions);

      // Phase 11: Export artifacts (references export_batches)
      await db.delete(exportArtifacts);

      // Phase 12: Export batches
      await db.delete(exportBatches);

      // Phase 13: Job runs and committee packets (reference jobs)
      await db.delete(jobRuns);
      await db.delete(committeePackets);

      // Phase 14: Jobs
      await db.delete(jobs);

      // Phase 15: Departments catalog
      await db.delete(departments);

      console.log("Database purge completed successfully");

      res.json({ success: true, message: "Base de datos purgada exitosamente" });
    } catch (error) {
      console.error("Error purging database:", error);
      res.status(500).json({ message: "Error al purgar la base de datos", error: String(error) });
    }
  });

  // ===== EMERGENCY NUKE (PROJECTS ONLY) =====
  app.delete("/api/admin/nuke-database", async (req, res) => {
    try {
      console.log("🔥 NUKE DATABASE: Starting emergency wipe of projects table...");

      const { projects, changeLogs, projectUpdates, milestones } = await import("@shared/schema");

      // Delete dependent tables first
      await db.delete(changeLogs);
      await db.delete(projectUpdates);
      await db.delete(milestones);

      // Delete all projects
      const result = await db.delete(projects);

      console.log("🔥 NUKE DATABASE: Complete. All project rows deleted.");

      res.json({
        success: true,
        message: "Database Nuke Complete. All project rows deleted.",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("NUKE DATABASE ERROR:", error);
      res.status(500).json({ message: "Error nuking database", error: String(error) });
    }
  });

  // ===== DASHBOARD =====
  app.get("/api/dashboard", async (req, res) => {
    try {
      const { q, estado, depto, analista } = req.query as {
        q?: string;
        estado?: string;
        depto?: string;
        analista?: string;
      };

      let allProjects = await storage.getProjects();

      // Apply global filters
      if (q || estado || depto || analista) {
        allProjects = allProjects.filter(project => {
          if (q) {
            const searchLower = q.toLowerCase();
            const matchesSearch =
              project.projectName?.toLowerCase().includes(searchLower) ||
              project.responsible?.toLowerCase().includes(searchLower) ||
              project.departmentName?.toLowerCase().includes(searchLower) ||
              project.legacyId?.toLowerCase().includes(searchLower);
            if (!matchesSearch) return false;
          }
          if (estado && estado !== "all" && project.status !== estado) {
            return false;
          }
          if (depto && depto !== "all" && !normalizedEquals(project.departmentName, depto)) {
            return false;
          }
          if (analista && analista !== "all") {
            const extraFields = project.extraFields as Record<string, unknown> | null;
            const analyst = extraFields?.["Business Process Analyst"] as string | undefined;
            if (!analyst || !normalizedEquals(analyst, analista)) {
              return false;
            }
          }
          return true;
        });
      }

      // Calculate stats
      let openProjects = 0;
      let closedProjects = 0;
      let overdueProjects = 0;

      const departmentCounts: Record<string, number> = {};
      const statusCounts: Record<string, number> = {};
      const trafficSummary = { green: 0, yellow: 0, red: 0, gray: 0 };

      // Lists for alerts
      const overdueList: { id: number; projectName: string; endDateEstimated: string | null; status: string | null; departmentName: string | null; daysOverdue: number }[] = [];
      const approachingList: { id: number; projectName: string; endDateEstimated: string | null; daysRemaining: number; departmentName: string | null }[] = [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      allProjects.forEach(project => {
        // Status counts
        const status = project.status || "Sin estado";
        statusCounts[status] = (statusCounts[status] || 0) + 1;

        const lowerStatus = status.toLowerCase();
        if (lowerStatus === "cerrado" || lowerStatus === "closed" || lowerStatus === "completado") {
          closedProjects++;
        } else if (lowerStatus !== "cancelado" && lowerStatus !== "cancelled") {
          openProjects++;
        }

        // Department counts
        const dept = project.departmentName || "Sin departamento";
        departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;

        // Traffic light - uses estatusAlDia from Excel when available
        const light = calculateTrafficLight(project.endDateEstimated, project.endDateEstimatedTbd, project.status, project.estatusAlDia);
        trafficSummary[light]++;

        if (light === "red") {
          overdueProjects++;
          // Add to overdue list with days calculation
          if (project.endDateEstimated) {
            const dueDate = new Date(project.endDateEstimated);
            dueDate.setHours(0, 0, 0, 0);
            const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            overdueList.push({
              id: project.id,
              projectName: project.projectName,
              endDateEstimated: project.endDateEstimated,
              status: project.status,
              departmentName: project.departmentName,
              daysOverdue,
            });
          }
        } else if (light === "yellow") {
          // Add to approaching deadline list
          if (project.endDateEstimated) {
            const dueDate = new Date(project.endDateEstimated);
            dueDate.setHours(0, 0, 0, 0);
            const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            approachingList.push({
              id: project.id,
              projectName: project.projectName,
              endDateEstimated: project.endDateEstimated,
              daysRemaining,
              departmentName: project.departmentName,
            });
          }
        }
      });

      // Sort and limit overdue list (most overdue first)
      const sortedOverdueList = overdueList
        .sort((a, b) => b.daysOverdue - a.daysOverdue)
        .slice(0, 10);

      // Sort and limit approaching list (soonest first)
      const sortedApproachingList = approachingList
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .slice(0, 10);

      // Calculate stale projects (not updated in 30+ days)
      const projectIds = allProjects.map(p => p.id);
      const latestUpdateDates = await storage.getLatestUpdateDatesByProjectIds(projectIds);

      const staleList: { id: number; projectName: string; lastUpdated: string | null; daysSinceUpdate: number; departmentName: string | null }[] = [];

      allProjects.forEach(project => {
        // Check if project is not closed/cancelled
        const lowerStatus = (project.status || "").toLowerCase();
        if (lowerStatus === "cerrado" || lowerStatus === "closed" || lowerStatus === "completado" ||
          lowerStatus === "cancelado" || lowerStatus === "cancelled") {
          return;
        }

        // Get the latest update date (from projectUpdates table or fall back to project's updatedAt)
        const lastUpdateFromTable = latestUpdateDates.get(project.id);
        const lastUpdate = lastUpdateFromTable || project.updatedAt;

        if (lastUpdate) {
          const lastUpdateDate = new Date(lastUpdate);
          lastUpdateDate.setHours(0, 0, 0, 0);
          const daysSinceUpdate = Math.floor((today.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysSinceUpdate >= 30) {
            staleList.push({
              id: project.id,
              projectName: project.projectName,
              lastUpdated: lastUpdate instanceof Date ? lastUpdate.toISOString() : String(lastUpdate),
              daysSinceUpdate,
              departmentName: project.departmentName,
            });
          }
        }
      });

      // Sort and limit stale list (most stale first)
      const sortedStaleList = staleList
        .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
        .slice(0, 10);

      res.json({
        totalProjects: allProjects.length,
        openProjects,
        closedProjects,
        overdueProjects,
        projectsByDepartment: Object.entries(departmentCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        projectsByStatus: Object.entries(statusCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        recentUpdates: allProjects.slice(0, 5),
        trafficLightSummary: trafficSummary,
        overdueProjectsList: sortedOverdueList,
        approachingDeadlineList: sortedApproachingList,
        staleProjectsList: sortedStaleList,
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Error loading dashboard" });
    }
  });

  // ===== PROJECTS =====
  app.get("/api/projects", async (req, res) => {
    try {
      let projects = await storage.getProjects();

      // Apply global filters
      const { q, estado, depto, analista } = req.query;

      if (q && typeof q === "string") {
        const searchLower = q.toLowerCase();
        projects = projects.filter(p =>
          p.projectName?.toLowerCase().includes(searchLower) ||
          p.departmentName?.toLowerCase().includes(searchLower) ||
          p.responsible?.toLowerCase().includes(searchLower) ||
          p.legacyId?.toLowerCase().includes(searchLower)
        );
      }

      if (estado && estado !== "all") {
        projects = projects.filter(p => p.status === estado);
      }

      if (depto && depto !== "all") {
        projects = projects.filter(p => normalizedEquals(p.departmentName, depto as string));
      }

      if (analista && analista !== "all") {
        projects = projects.filter(p => {
          const extra = (p.extraFields || {}) as Record<string, unknown>;
          const projectAnalyst = extra["Business Process Analyst"] as string | undefined;
          return projectAnalyst && normalizedEquals(projectAnalyst, analista as string);
        });
      }

      res.json({ projects, total: projects.length });
    } catch (error) {
      console.error("Projects error:", error);
      res.status(500).json({ message: "Error loading projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const updates = await storage.getProjectUpdatesByProjectId(id);
      const milestonesList = await storage.getMilestonesByProjectId(id);
      const changeLogsList = await storage.getChangeLogsByProjectId(id);

      res.json({
        project,
        updates,
        milestones: milestonesList,
        changeLogs: changeLogsList,
      });
    } catch (error) {
      console.error("Project detail error:", error);
      res.status(500).json({ message: "Error loading project" });
    }
  });

  // Create a new project directly (requires Editor role)
  app.post("/api/projects", isAuthenticated, isEditor, async (req, res) => {
    try {
      const validation = createProjectSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.errors[0]?.message || "Datos inválidos"
        });
      }

      const projectData = {
        ...validation.data,
        isActive: true,
      };

      const project = await storage.createProject(projectData);
      res.status(201).json(project);
    } catch (error) {
      console.error("Create project error:", error);
      res.status(500).json({ message: "Error creating project" });
    }
  });

  // ===== BULK OPERATIONS =====
  app.post("/api/projects/bulk/update", isAuthenticated, isEditor, async (req, res) => {
    try {
      const validation = bulkUpdateSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.errors[0]?.message || "Datos inválidos"
        });
      }

      const { ids, field, value } = validation.data;
      const updatedCount = await storage.bulkUpdateProjects(ids, field, value);

      res.json({
        success: true,
        updatedCount,
        message: `Se actualizaron ${updatedCount} proyectos`
      });
    } catch (error) {
      console.error("Bulk update error:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Error al actualizar proyectos"
      });
    }
  });

  // ===== BULK CSV IMPORT =====
  app.post("/api/projects/bulk", isAuthenticated, isEditor, async (req, res) => {
    try {
      const { projects: projectsData } = req.body;

      if (!Array.isArray(projectsData) || projectsData.length === 0) {
        return res.status(400).json({ message: "Se requiere un array de proyectos" });
      }

      const results = { created: 0, errors: [] as string[] };

      for (let i = 0; i < projectsData.length; i++) {
        try {
          const row = projectsData[i];

          // Sanitize budget: remove $, commas, whitespace
          let budget = 0;
          const budgetValue = row.budget ?? row.presupuesto ?? row.Budget ?? row.Presupuesto;
          if (budgetValue !== undefined && budgetValue !== null) {
            const budgetStr = String(budgetValue).replace(/[$,\s]/g, "").trim();
            budget = parseFloat(budgetStr) || 0;
            if (isNaN(budget)) budget = 0;
          }

          // Build project object with auto-mapped fields
          const projectData = {
            projectName: row.projectName || row.nombre || row.proyecto || `Proyecto ${i + 1}`,
            bpAnalyst: row.bpAnalyst || row.analista || row.bp_analyst || null,
            departmentName: row.departmentName || row.depto || row.area || row.negocio || null,
            region: row.region || null,
            status: row.status || row.estado || "Draft",
            problemStatement: row.problemStatement || row.problema || row.problem_statement || null,
            objective: row.objective || row.objetivo || null,
            scopeIn: row.scopeIn || row.scope_in || null,
            scopeOut: row.scopeOut || row.scope_out || null,
            description: row.description || row.descripcion || null,
            impactType: row.impactType || [],
            kpis: row.kpis || row.indicadores || null,
            budget: Math.round(budget),
            sponsor: row.sponsor || row.patrocinador || null,
            leader: row.leader || row.lider || null,
            responsible: row.responsible || row.responsable || null,
            startDate: row.startDate || row.fecha_inicio || null,
            endDate: row.endDate || row.fecha_fin || null,
            priority: row.priority || row.prioridad || "Media",
          };

          await storage.createProject(projectData as any);
          results.created++;
        } catch (err) {
          results.errors.push(`Fila ${i + 1}: ${err instanceof Error ? err.message : "Error desconocido"}`);
        }
      }

      res.json({
        success: true,
        created: results.created,
        errors: results.errors,
        message: `Se crearon ${results.created} proyectos. ${results.errors.length > 0 ? `${results.errors.length} errores.` : ""}`
      });
    } catch (error) {
      console.error("Bulk import error:", error);
      res.status(500).json({ message: "Error al importar proyectos", error: String(error) });
    }
  });

  // ===== EXCEL IMPORT WITH ANCHOR ROW DETECTION (Python Parser) =====
  // TODO: Re-enable auth for production: isAuthenticated, isEditor
  app.post("/api/projects/import", uploadRateLimit, upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No se proporcionó ningún archivo" });
      }

      const allowedExtensions = ['.xlsx', '.xls'];
      const fileExt = path.extname(req.file.originalname).toLowerCase();
      if (!allowedExtensions.includes(fileExt)) {
        return res.status(400).json({ message: "Formato de archivo no soportado. Use .xlsx o .xls" });
      }

      const tempDir = '/tmp';
      const tempFileName = `excel_import_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${fileExt}`;
      const tempFilePath = path.join(tempDir, tempFileName);

      fs.writeFileSync(tempFilePath, req.file.buffer);

      const pythonScript = path.join(process.cwd(), 'server', 'utils', 'excel_parser.py');

      const PARSER_TIMEOUT_MS = 30000;
      const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

      const result = await new Promise<{
        success: boolean;
        projects: any[];
        errors: string[];
        metadata: {
          header_row: number | null;
          total_rows: number;
          columns_mapped: Record<string, string>;
          columns_unmapped: string[];
        };
      }>((resolve, reject) => {
        const pythonProcess = spawn('python3', [pythonScript, tempFilePath], {
          timeout: PARSER_TIMEOUT_MS,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const timeout = setTimeout(() => {
          killed = true;
          pythonProcess.kill('SIGKILL');
          fs.unlink(tempFilePath, () => { });
          reject(new Error('Parser timeout: El archivo tardó demasiado en procesarse'));
        }, PARSER_TIMEOUT_MS);

        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
          if (stdout.length > MAX_OUTPUT_SIZE) {
            killed = true;
            pythonProcess.kill('SIGKILL');
            clearTimeout(timeout);
            fs.unlink(tempFilePath, () => { });
            reject(new Error('Output size exceeded: El archivo genera demasiados datos'));
          }
        });

        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
          if (stderr.length > MAX_OUTPUT_SIZE) {
            killed = true;
            pythonProcess.kill('SIGKILL');
            clearTimeout(timeout);
            fs.unlink(tempFilePath, () => { });
            reject(new Error('Error output exceeded limits'));
          }
        });

        pythonProcess.on('close', (code) => {
          clearTimeout(timeout);
          fs.unlink(tempFilePath, () => { });

          if (killed) return;

          if (code !== 0) {
            reject(new Error(`Python parser failed: ${stderr || 'Unknown error'}`));
            return;
          }

          try {
            const parsed = JSON.parse(stdout);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse Python output: ${stdout.slice(0, 500)}`));
          }
        });

        pythonProcess.on('error', (err) => {
          clearTimeout(timeout);
          fs.unlink(tempFilePath, () => { });
          if (!killed) reject(err);
        });
      });

      if (!result.success || result.projects.length === 0) {
        return res.status(400).json({
          success: false,
          message: result.projects.length === 0
            ? "No se encontraron proyectos válidos en el archivo"
            : "Error procesando el archivo Excel",
          errors: result.errors,
          metadata: result.metadata
        });
      }

      const importResults = { created: 0, errors: [] as string[] };

      for (let i = 0; i < result.projects.length; i++) {
        try {
          const project = result.projects[i];

          let budget = 0;
          if (project.budget !== undefined && project.budget !== null) {
            budget = typeof project.budget === 'number' ? project.budget : parseFloat(String(project.budget).replace(/[^\d.-]/g, '')) || 0;
          }

          const projectData = {
            projectName: project.projectName || `Proyecto Importado ${i + 1}`,
            bpAnalyst: project.bpAnalyst || null,
            departmentName: project.departmentName || null,
            region: project.region || null,
            status: project.status || "Draft",
            problemStatement: project.problemStatement || null,
            objective: project.objective || null,
            scopeIn: project.scopeIn || null,
            scopeOut: project.scopeOut || null,
            impactType: Array.isArray(project.impactType) ? project.impactType : [],
            kpis: project.kpis || null,
            budget: budget,
            sponsor: project.sponsor || null,
            leader: project.leader || null,
            responsible: project.responsible || null,
            startDate: project.startDate || null,
            endDateEstimated: project.endDateEstimated || null,
            priority: project.priority || "Media",
            category: project.category || null,
            comments: project.comments || null,
            benefits: project.benefits || null,
            risks: project.risks || null,
            percentComplete: project.percentComplete || 0,
            totalValor: project.totalValor || null,
            totalEsfuerzo: project.totalEsfuerzo || null,
            // Additional PMO fields from Excel parsing
            ranking: project.ranking || null,
            puntajeTotal: project.puntajeTotal || null,
            legacyId: project.legacyId || null,
            estatusAlDia: project.estatusAlDia || null,
            statusText: project.statusText || null,
            description: project.description || null,
            fase: project.fase || null,
            registrationDate: project.registrationDate || null,
            capexTier: project.capexTier || null,
            financialImpact: project.financialImpact || null,
            strategicFit: project.strategicFit || null,
            // EXCEL ADDITIONAL FIELDS
            previo: project.previo || null,
            cardIdDevops: project.cardIdDevops || null,
            valorDiferenciador: project.valorDiferenciador || null,
            tiempoCicloDias: project.tiempoCicloDias || null,
            ingresadaEnPbot: project.ingresadaEnPbot || null,
            grupoTecnicoAsignado: project.grupoTecnicoAsignado || null,
            // DEPENDENCIES
            dependenciasItLocal: project.dependenciasItLocal || false,
            dependenciasTDigital: project.dependenciasTDigital || false,
            dependenciasDigitalizacionSsc: project.dependenciasDigitalizacionSsc || false,
            dependenciasExterno: project.dependenciasExterno || false,
            // TEAM ROLES
            citizenDeveloper: project.citizenDeveloper || null,
            dtcLead: project.dtcLead || null,
            blackBeltLead: project.blackBeltLead || null,
            // BUSINESS CONTEXT
            direccionNegocioUsuario: project.direccionNegocioUsuario || null,
            impactaGasesEnvasados: project.impactaGasesEnvasados || null,
            areaProductividad: project.areaProductividad || null,
            // SCORING MATRIX EXTENDED
            scoringNivelDemanda: project.scoringNivelDemanda || null,
            scoringTieneSponsor: project.scoringTieneSponsor || null,
            scoringPersonasAfecta: project.scoringPersonasAfecta || null,
            scoringEsReplicable: project.scoringEsReplicable || null,
            scoringEsEstrategico: project.scoringEsEstrategico || null,
            scoringTiempoDesarrollo: project.scoringTiempoDesarrollo || null,
            scoringCalidadInformacion: project.scoringCalidadInformacion || null,
            scoringTiempoConseguirInfo: project.scoringTiempoConseguirInfo || null,
            scoringComplejidadTecnica: project.scoringComplejidadTecnica || null,
            scoringComplejidadCambio: project.scoringComplejidadCambio || null,
            // BUSINESS IMPACT
            accionesAcelerar: project.accionesAcelerar || null,
            businessImpactGrowth: project.businessImpactGrowth || null,
            businessImpactCostos: project.businessImpactCostos || null,
            businessImpactOther: project.businessImpactOther || null,
          };

          await storage.createProject(projectData as any);
          importResults.created++;
        } catch (error) {
          importResults.errors.push(`Proyecto ${i + 1}: ${String(error)}`);
        }
      }

      res.json({
        success: true,
        created: importResults.created,
        errors: [...result.errors, ...importResults.errors],
        metadata: result.metadata,
        message: `Se importaron ${importResults.created} de ${result.projects.length} proyectos.${importResults.errors.length > 0 ? ` ${importResults.errors.length} errores.` : ""}`
      });

    } catch (error) {
      console.error("Excel import error:", error);
      res.status(500).json({
        success: false,
        message: "Error al importar archivo Excel",
        error: String(error)
      });
    }
  });

  // ===== PMO AUDIT ENDPOINTS =====
  app.post("/api/projects/audit-batch", isAuthenticated, isEditor, async (req, res) => {
    try {
      const result = await auditAllProjects();

      res.json({
        success: true,
        message: `Auditoría completada. ${result.audited} proyectos auditados.`,
        ...result,
      });
    } catch (error) {
      console.error("PMO Audit error:", error);
      res.status(500).json({
        success: false,
        message: "Error al ejecutar auditoría"
      });
    }
  });

  app.post("/api/projects/:id/audit", isAuthenticated, isEditor, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const result = await auditSingleProject(id);

      if (!result) {
        return res.status(404).json({ message: "Proyecto no encontrado" });
      }

      res.json({
        success: true,
        projectId: id,
        ...result,
      });
    } catch (error) {
      console.error("Single project audit error:", error);
      res.status(500).json({
        success: false,
        message: "Error al auditar proyecto"
      });
    }
  });

  // ===== AI ENRICHMENT ENDPOINT =====
  app.post("/api/projects/:id/enrich", isAuthenticated, isEditor, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ message: "Proyecto no encontrado" });
      }

      const result = await enrichProjectMetadata(project);

      res.json({
        projectId: id,
        projectName: project.projectName,
        ...result,
      });
    } catch (error) {
      console.error("Enrichment error:", error);
      res.status(500).json({
        success: false,
        message: "Error al generar sugerencias con IA"
      });
    }
  });

  app.post("/api/projects/bulk/delete", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const validation = bulkDeleteSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.errors[0]?.message || "Datos inválidos"
        });
      }

      const { ids } = validation.data;
      const deletedCount = await storage.bulkDeleteProjects(ids);

      res.json({
        success: true,
        deletedCount,
        message: `Se eliminaron ${deletedCount} proyectos`
      });
    } catch (error) {
      console.error("Bulk delete error:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Error al eliminar proyectos"
      });
    }
  });

  // ===== PATCH SINGLE PROJECT (with revalidation) =====
  // TEMP: Auth disabled for testing
  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const updateData = req.body;
      await storage.updateProject(id, updateData);

      // Re-validate project after update
      const validationResult = await validateAndUpdateProject(id);

      res.json({
        success: true,
        message: "Proyecto actualizado",
        validation: validationResult
      });
    } catch (error) {
      console.error("Project update error:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Error al actualizar proyecto"
      });
    }
  });

  // ===== DATA HEALTH ENDPOINTS =====
  // TEMP: Auth disabled for testing
  app.get("/api/health/stats", async (req, res) => {
    try {
      const stats = await getHealthStats();
      res.json(stats);
    } catch (error) {
      console.error("Health stats error:", error);
      res.status(500).json({ message: "Error al obtener estadísticas de salud" });
    }
  });

  app.get("/api/health/dirty-projects", async (req, res) => {
    try {
      const dirtyProjects = await getDirtyProjects();
      res.json(dirtyProjects);
    } catch (error) {
      console.error("Dirty projects error:", error);
      res.status(500).json({ message: "Error al obtener proyectos con errores" });
    }
  });

  app.post("/api/health/audit", async (req, res) => {
    try {
      const auditResult = await runFullAudit();
      res.json(auditResult);
    } catch (error) {
      console.error("Full audit error:", error);
      res.status(500).json({ message: "Error al ejecutar auditoría" });
    }
  });

  // ===== PORTFOLIO STRATEGIC INSIGHTS =====
  app.get("/api/pmo/insights", async (req, res) => {
    try {
      const { getPortfolioInsights } = await import("./services/portfolioInsights");
      const insights = await getPortfolioInsights();
      res.json(insights);
    } catch (error) {
      console.error("Portfolio insights error:", error);
      res.status(500).json({ message: "Error al generar insights del portafolio" });
    }
  });

  // ===== CHASER AGENT (TARGETED NOTIFICATIONS) =====
  app.post("/api/chaser/run-cycle", async (req, res) => {
    try {
      const { runChaserCycle } = await import("./services/chaser");
      const result = await runChaserCycle();
      res.json(result);
    } catch (error) {
      console.error("Chaser cycle error:", error);
      res.status(500).json({ message: "Error al ejecutar ciclo de notificaciones" });
    }
  });

  app.get("/api/chaser/stats", async (req, res) => {
    try {
      const { getChaserStats } = await import("./services/chaser");
      const stats = await getChaserStats();
      res.json(stats);
    } catch (error) {
      console.error("Chaser stats error:", error);
      res.status(500).json({ message: "Error al obtener estadísticas del chaser" });
    }
  });

  // ===== EXPORT EXCEL =====
  app.post("/api/projects/export", async (req, res) => {
    try {
      const { search, status, department } = req.body || {};

      let allProjects = await storage.getProjects();

      // Apply filters
      let filteredProjects = allProjects.filter((project) => {
        // Search filter
        if (search) {
          const searchLower = search.toLowerCase();
          const matchesSearch =
            project.projectName?.toLowerCase().includes(searchLower) ||
            project.responsible?.toLowerCase().includes(searchLower) ||
            project.departmentName?.toLowerCase().includes(searchLower) ||
            project.legacyId?.toLowerCase().includes(searchLower);
          if (!matchesSearch) return false;
        }

        // Status filter
        if (status && status !== "all" && project.status !== status) {
          return false;
        }

        // Department filter
        if (department && department !== "all" && project.departmentName !== department) {
          return false;
        }

        return true;
      });

      // Format date helper
      const formatDate = (date: string | null | undefined): string => {
        if (!date) return "";
        try {
          const d = new Date(date);
          return d.toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          });
        } catch {
          return date;
        }
      };

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Export date header row
      const exportDate = new Date().toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // Define columns with Spanish headers matching grid
      const headers = [
        "ID Legacy",
        "Proyecto",
        "Responsable",
        "Departamento",
        "Estado",
        "Fecha Inicio",
        "Fecha Fin Estimada",
        "Fecha Fin Real",
        "% Avance",
        "Última Actualización",
        "Observaciones",
      ];

      // Build last update combining S: and N: fields
      const buildLastUpdate = (p: Project): string => {
        const parts: string[] = [];
        if (p.parsedStatus) {
          parts.push(`S: ${p.parsedStatus}`);
        }
        if (p.parsedNextSteps) {
          parts.push(`N: ${p.parsedNextSteps}`);
        }
        return parts.join("\n") || "";
      };

      // Map projects to rows
      const dataRows = filteredProjects.map((p) => [
        p.legacyId || "",
        p.projectName || "",
        p.responsible || "",
        p.departmentName || "",
        p.status || "",
        formatDate(p.startDate),
        p.endDateEstimatedTbd ? "TBD" : formatDate(p.endDateEstimated),
        formatDate(p.endDateActual),
        p.percentComplete !== null && p.percentComplete !== undefined ? `${p.percentComplete}%` : "",
        buildLastUpdate(p),
        p.comments || "",
      ]);

      // Create worksheet with export date header
      const wsData = [
        [`Fecha de exportación: ${exportDate}`],
        [],
        headers,
        ...dataRows,
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws["!cols"] = [
        { wch: 12 },  // ID Legacy
        { wch: 45 },  // Proyecto
        { wch: 25 },  // Responsable
        { wch: 25 },  // Departamento
        { wch: 15 },  // Estado
        { wch: 14 },  // Fecha Inicio
        { wch: 18 },  // Fecha Fin Estimada
        { wch: 14 },  // Fecha Fin Real
        { wch: 10 },  // % Avance
        { wch: 60 },  // Última Actualización
        { wch: 40 },  // Observaciones
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Proyectos");

      // Generate buffer
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      // Set response headers
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=proyectos.xlsx");
      res.setHeader("Content-Length", buffer.length);

      res.send(buffer);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ message: "Error al exportar proyectos" });
    }
  });

  // ===== EXCEL UPLOAD =====
  // Pre-auth logging middleware to debug upload issues
  app.post("/api/excel/upload", (req, res, next) => {
    console.log("[Excel Upload] === REQUEST RECEIVED ===");
    console.log("[Excel Upload] Content-Type:", req.headers["content-type"]);
    console.log("[Excel Upload] Content-Length:", req.headers["content-length"]);
    console.log("[Excel Upload] Session:", req.session ? "exists" : "none");
    console.log("[Excel Upload] User:", req.user ? "authenticated" : "NOT authenticated");
    next();
  }, isAuthenticated, isEditor, upload.single("file"), async (req, res) => {
    console.log("[Excel Upload] Past auth - processing file");
    console.log("[Excel Upload] File info:", req.file ? { name: req.file.originalname, size: req.file.size } : "No file");

    try {
      if (!req.file) {
        console.log("[Excel Upload] Error: No file in request");
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log("[Excel Upload] Starting to process file:", req.file.originalname);

      // Create version record
      console.log("[Excel Upload] Creating version record...");
      const version = await storage.createExcelVersion({
        fileName: req.file.originalname,
        totalRows: 0,
        status: "processing",
      });
      console.log("[Excel Upload] Version created:", version.id);

      // Get previous version for comparison
      const versions = await storage.getExcelVersions();
      const previousVersion = versions.find(v => v.id !== version.id && v.status === "completed");

      // Parse Excel with enhanced error handling
      console.log("[Excel Upload] Parsing Excel buffer...");
      const parsed = parseExcelBuffer(req.file.buffer, version.id);
      console.log("[Excel Upload] Parsing complete. Projects found:", parsed.projects.length);

      // Get existing projects for comparison
      const existingProjects = await storage.getProjects();
      const existingByLegacyId = new Map(
        existingProjects.map(p => [p.legacyId, p])
      );

      // Process projects and track changes
      const allChanges: InsertChangeLog[] = [];
      const newProjectIds: number[] = [];
      const processedLegacyIds = new Set<string>();

      let addedCount = 0;
      let modifiedCount = 0;

      for (const projectData of parsed.projects) {
        const legacyId = projectData.legacyId;
        if (legacyId) {
          processedLegacyIds.add(legacyId);
        }

        const existing = legacyId ? existingByLegacyId.get(legacyId) : null;

        if (existing) {
          // Update existing project
          const changes: InsertChangeLog[] = compareProjects(
            existing,
            projectData,
            version.id,
            previousVersion?.id || null
          );

          // Always update sourceVersionId to mark project as part of this version
          const updateData: InsertProject = {
            ...projectData as InsertProject,
            sourceVersionId: version.id,
          };
          await storage.updateProject(existing.id, updateData);

          if (changes.length > 0) {
            for (const change of changes) {
              (change as { projectId: number }).projectId = existing.id;
            }
            allChanges.push(...changes);
            modifiedCount++;
          }

          // Always add to active list (fixed: was only adding when changes existed)
          newProjectIds.push(existing.id);
        } else {
          // Create new project - cast to InsertProject for storage
          const insertData: InsertProject = {
            ...projectData as InsertProject,
            sourceVersionId: version.id,
          };
          const newProject = await storage.createProject(insertData);

          newProjectIds.push(newProject.id);

          allChanges.push({
            projectId: newProject.id,
            versionId: version.id,
            previousVersionId: previousVersion?.id || null,
            changeType: "added",
            fieldName: null,
            oldValue: null,
            newValue: projectData.projectName || null,
            legacyId: projectData.legacyId || null,
            projectName: projectData.projectName || null,
          });

          addedCount++;

          // Create initial project update if S/N data exists
          if (projectData.parsedStatus || projectData.parsedNextSteps) {
            await storage.createProjectUpdate({
              projectId: newProject.id,
              statusText: projectData.parsedStatus || null,
              nextStepsText: projectData.parsedNextSteps || null,
              rawText: projectData.statusText || null,
              sourceVersionId: version.id,
            });
          }
        }
      }

      // Mark deleted projects
      let deletedCount = 0;
      for (const existing of existingProjects) {
        if (existing.legacyId && !processedLegacyIds.has(existing.legacyId)) {
          // This project was not in the new upload
          allChanges.push({
            projectId: existing.id,
            versionId: version.id,
            previousVersionId: previousVersion?.id || null,
            changeType: "deleted",
            fieldName: null,
            oldValue: existing.projectName,
            newValue: null,
            legacyId: existing.legacyId,
            projectName: existing.projectName,
          });
          deletedCount++;
        }
      }

      // Save change logs
      if (allChanges.length > 0) {
        await storage.createChangeLogs(allChanges);
      }

      // Deactivate projects not in new version
      if (newProjectIds.length > 0) {
        await storage.deactivateProjectsNotInVersion(version.id, newProjectIds);
      }

      // Calculate and save KPIs
      const updatedProjects = await storage.getProjects();
      const kpis = calculateKpis(updatedProjects, version.id);
      await storage.createKpiValues(kpis);

      // Update version status with warning messages
      const errorMessages = parsed.advertencias.map(w => `Fila ${w.fila}: ${w.mensaje}`);
      await storage.updateExcelVersionStatus(
        version.id,
        "completed",
        parsed.proyectosCreados + parsed.proyectosBorradorIncompleto,
        errorMessages
      );

      // Run data health audit after upload
      try {
        await runFullAudit();
        console.log("[Excel Upload] Data health audit completed");
      } catch (auditError) {
        console.error("[Excel Upload] Data health audit failed:", auditError);
      }

      // Return new enhanced response format
      res.json({
        success: true,
        versionId: version.id,
        fileName: req.file.originalname,
        totalRows: parsed.totalRows,
        proyectosCreados: parsed.proyectosCreados,
        proyectosBorradorIncompleto: parsed.proyectosBorradorIncompleto,
        filasDescartadas: parsed.filasDescartadas,
        advertencias: parsed.advertencias,
        changes: {
          added: addedCount,
          modified: modifiedCount,
          deleted: deletedCount,
        },
      });

    } catch (error) {
      console.error("[Excel Upload] ERROR:", error);
      console.error("[Excel Upload] Stack:", error instanceof Error ? error.stack : "No stack trace");
      res.status(500).json({
        message: error instanceof Error ? error.message : "Error processing file"
      });
    }
  });

  // ===== VERSIONS =====
  app.get("/api/versions", async (req, res) => {
    try {
      const versions = await storage.getExcelVersions();
      res.json({ versions });
    } catch (error) {
      console.error("Versions error:", error);
      res.status(500).json({ message: "Error loading versions" });
    }
  });

  app.get("/api/versions/compare", async (req, res) => {
    try {
      const fromId = parseInt(req.query.from as string);
      const toId = parseInt(req.query.to as string);

      if (isNaN(fromId) || isNaN(toId)) {
        return res.status(400).json({ message: "Invalid version IDs" });
      }

      const fromVersion = await storage.getExcelVersion(fromId);
      const toVersion = await storage.getExcelVersion(toId);

      if (!fromVersion || !toVersion) {
        return res.status(404).json({ message: "Version not found" });
      }

      const changes = await storage.getChangeLogsBetweenVersions(fromId, toId);

      // Calculate summary
      let added = 0, modified = 0, deleted = 0;
      changes.forEach(c => {
        if (c.changeType === "added") added++;
        else if (c.changeType === "modified") modified++;
        else if (c.changeType === "deleted") deleted++;
      });

      res.json({
        changes,
        summary: { added, modified, deleted },
        fromVersion,
        toVersion,
      });
    } catch (error) {
      console.error("Version compare error:", error);
      res.status(500).json({ message: "Error comparing versions" });
    }
  });

  // ===== INDICATORS =====
  app.get("/api/indicators", async (req, res) => {
    try {
      const kpis = await storage.getLatestKpiValues();
      const allProjects = await storage.getProjects();

      // If no projects, return empty state
      if (allProjects.length === 0) {
        return res.json({
          kpis: [],
          projectsByMonth: [],
          projectsByCategory: [],
          completionRate: [],
          avgDuration: 0,
          onTimeDelivery: 0,
          totalBenefits: 0,
          activeProjects: 0,
          successRate: 0,
          isEmpty: true,
        });
      }

      // Calculate category distribution from REAL data
      const categoryCounts: Record<string, number> = {};
      allProjects.forEach(p => {
        const cat = p.category || p.departmentName || "Sin categoría";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });

      // Calculate projects by month from REAL start dates
      const monthCounts: Record<string, { count: number; closed: number }> = {};
      allProjects.forEach(p => {
        if (p.startDate) {
          const date = new Date(p.startDate);
          const monthKey = date.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
          if (!monthCounts[monthKey]) {
            monthCounts[monthKey] = { count: 0, closed: 0 };
          }
          monthCounts[monthKey].count++;
          
          const statusLower = (p.status || "").toLowerCase();
          if (statusLower === "cerrado" || statusLower === "closed") {
            monthCounts[monthKey].closed++;
          }
        }
      });

      const projectsByMonth = Object.entries(monthCounts)
        .map(([month, data]) => ({ month, ...data }))
        .slice(-6); // Last 6 months

      // Calculate REAL completion rate from project percentComplete
      const completionRate = projectsByMonth.map(m => {
        const projectsInMonth = allProjects.filter(p => {
          if (!p.startDate) return false;
          const date = new Date(p.startDate);
          return date.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }) === m.month;
        });
        const avgRate = projectsInMonth.length > 0
          ? Math.round(projectsInMonth.reduce((sum, p) => sum + (p.percentComplete || 0), 0) / projectsInMonth.length)
          : 0;
        return { month: m.month, rate: avgRate };
      });

      // Calculate average duration for closed projects
      const closedProjects = allProjects.filter(p => {
        const lower = (p.status || "").toLowerCase();
        return (lower === "cerrado" || lower === "closed") && p.startDate && p.endDateActual;
      });

      let avgDuration = 0;
      if (closedProjects.length > 0) {
        const totalDays = closedProjects.reduce((sum, p) => {
          const start = new Date(p.startDate!);
          const end = new Date(p.endDateActual!);
          return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        }, 0);
        avgDuration = Math.round(totalDays / closedProjects.length);
      }

      // Calculate REAL on-time delivery rate
      const kpiOnTime = kpis.find(k => k.kpiName === "Entrega a Tiempo");
      let onTimeDelivery = 0;
      if (kpiOnTime?.kpiValue) {
        onTimeDelivery = parseInt(kpiOnTime.kpiValue.replace("%", "")) || 0;
      } else if (closedProjects.length > 0) {
        // Calculate from actual data: projects completed on or before estimated date
        const onTimeCount = closedProjects.filter(p => {
          if (!p.endDateActual || !p.endDateEstimated) return false;
          return new Date(p.endDateActual) <= new Date(p.endDateEstimated);
        }).length;
        onTimeDelivery = Math.round((onTimeCount / closedProjects.length) * 100);
      }

      // Calculate active projects (not closed/cancelled)
      const activeProjects = allProjects.filter(p => {
        const lower = (p.status || "").toLowerCase();
        return lower !== "cerrado" && lower !== "closed" && lower !== "cancelado" && lower !== "cancelled";
      }).length;

      // Calculate success rate from closed projects
      const successRate = closedProjects.length > 0
        ? Math.round((closedProjects.length / allProjects.length) * 100)
        : 0;

      res.json({
        kpis,
        projectsByMonth,
        projectsByCategory: Object.entries(categoryCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        completionRate,
        avgDuration,
        onTimeDelivery,
        totalBenefits: 0,
        activeProjects,
        successRate,
        isEmpty: false,
      });
    } catch (error) {
      console.error("Indicators error:", error);
      res.status(500).json({ message: "Error loading indicators" });
    }
  });

  // ===== SCORING MATRIX =====
  app.get("/api/scoring/matrix", async (req, res) => {
    try {
      let allProjects = await storage.getProjects();

      // Apply filters (same as /api/dashboard)
      const { q, estado, depto, analista } = req.query;

      if (q && typeof q === "string") {
        const searchLower = q.toLowerCase();
        allProjects = allProjects.filter(p =>
          p.projectName?.toLowerCase().includes(searchLower) ||
          p.departmentName?.toLowerCase().includes(searchLower) ||
          p.responsible?.toLowerCase().includes(searchLower) ||
          p.legacyId?.toLowerCase().includes(searchLower)
        );
      }

      if (estado && estado !== "all") {
        allProjects = allProjects.filter(p => p.status === estado);
      }

      if (depto && depto !== "all") {
        allProjects = allProjects.filter(p => normalizedEquals(p.departmentName, depto as string));
      }

      if (analista && analista !== "all") {
        allProjects = allProjects.filter(p => {
          const extra = (p.extraFields || {}) as Record<string, unknown>;
          const projectAnalyst = extra["Business Process Analyst"] as string | undefined;
          return projectAnalyst && normalizedEquals(projectAnalyst, analista as string);
        });
      }

      // Extract scoring data from dedicated columns OR extraFields (for legacy data)
      const projectsWithScoring = allProjects
        .map(p => {
          // Try dedicated columns first, then extraFields
          const extra = (p.extraFields || {}) as Record<string, unknown>;
          const totalValor = p.totalValor ?? (parseFloat(String(extra["Total Valor"] || "")) || null);
          const totalEsfuerzo = p.totalEsfuerzo ?? (parseFloat(String(extra["Total Esfuerzo"] || "")) || null);
          const puntajeTotal = p.puntajeTotal ?? (parseFloat(String(extra["Puntaje Total"] || "")) || null);
          const ranking = p.ranking ?? (parseInt(String(extra["Ranking"] || extra["Renking General"] || ""), 10) || null);

          return {
            id: p.id,
            projectName: p.projectName,
            departmentName: p.departmentName,
            totalValor,
            totalEsfuerzo,
            puntajeTotal,
            ranking,
            status: p.status,
          };
        })
        .filter(p => p.totalValor !== null && p.totalEsfuerzo !== null && p.totalValor > 0 && p.totalEsfuerzo > 0);

      // Calculate medians for quadrant lines
      const valors = projectsWithScoring.map(p => p.totalValor!).sort((a, b) => a - b);
      const esfuerzos = projectsWithScoring.map(p => p.totalEsfuerzo!).sort((a, b) => a - b);

      const medianValor = valors.length > 0
        ? valors[Math.floor(valors.length / 2)]
        : 0;
      const medianEsfuerzo = esfuerzos.length > 0
        ? esfuerzos[Math.floor(esfuerzos.length / 2)]
        : 0;

      // Calculate quadrant counts
      // Note: Higher totalEsfuerzo = LESS effort (inverted in Excel)
      // So: Quick Wins = High Value + High totalEsfuerzo (less real effort)
      const quadrants = {
        quickWins: 0,  // High Value + Low Effort (high totalEsfuerzo)
        bigBets: 0,    // High Value + High Effort (low totalEsfuerzo)
        fillIns: 0,    // Low Value + Low Effort (high totalEsfuerzo)
        moneyPit: 0,   // Low Value + High Effort (low totalEsfuerzo)
      };

      projectsWithScoring.forEach(p => {
        const highValue = p.totalValor! >= medianValor;
        const lowEffort = p.totalEsfuerzo! >= medianEsfuerzo; // Higher = less effort

        if (highValue && lowEffort) quadrants.quickWins++;
        else if (highValue && !lowEffort) quadrants.bigBets++;
        else if (!highValue && lowEffort) quadrants.fillIns++;
        else quadrants.moneyPit++;
      });

      res.json({
        projects: projectsWithScoring,
        medianValor,
        medianEsfuerzo,
        quadrants,
        total: projectsWithScoring.length,
      });
    } catch (error) {
      console.error("Scoring matrix error:", error);
      res.status(500).json({ message: "Error loading scoring matrix" });
    }
  });

  // ===== CHAT =====
  app.get("/api/chat/messages", async (req, res) => {
    try {
      const messages = await storage.getChatMessages();
      res.json({ messages });
    } catch (error) {
      console.error("Chat messages error:", error);
      res.status(500).json({ message: "Error loading messages" });
    }
  });

  // TEMP: Auth disabled for testing
  app.post("/api/chat/send", async (req, res) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const startTime = Date.now();

    try {
      const parseResult = sendMessageSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          message: parseResult.error.errors[0]?.message || "Invalid request"
        });
      }

      const { content } = parseResult.data;

      // Save user message
      const userMessage = await storage.createChatMessage({
        role: "user",
        content,
        citations: [],
      });

      // Route the query
      const routeResult = routePmoQuery(content);
      const latestVersion = await storage.getLatestExcelVersion();

      let response: { content: string; citations: unknown[] };
      let responseMode: "DETERMINISTIC" | "LLM" | "ERROR" = "LLM";
      let errorCode: string | null = null;

      // Special handling for OWNER_DELAYED_PROJECTS (hybrid: deterministic + optional LLM narrative)
      if (routeResult.route === "OWNER_DELAYED_PROJECTS") {
        try {
          const hybridAnswer: OwnerDelayedProjectsAnswer = await generateOwnerDelayedProjectsAnswer(routeResult);

          // Try to add optional LLM narrative if circuit is not open
          if (!isCircuitOpen() && hybridAnswer.projects.length > 0) {
            try {
              const narrativePrompt = `Genera un breve resumen narrativo (2-3 oraciones) sobre los proyectos de ${hybridAnswer.owner_key}. 
Datos: ${hybridAnswer.count} proyectos, ${hybridAnswer.delayed_count} con demoras.
Proyectos demorados: ${hybridAnswer.projects.filter(p => p.is_delayed).map(p => `${p.title} (${p.delay_reasons.join(', ')})`).join('; ') || 'ninguno'}.
Responde SOLO con el resumen narrativo, sin agregar información adicional.`;

              const portfolioView = await getCurrentPortfolioView();
              const context: ChatContext = {
                projects: [],
                versionId: latestVersion?.id || null,
                versionFileName: latestVersion?.fileName || null,
              };

              const narrativeResponse = await withTimeout(
                generatePMOBotResponse(narrativePrompt, context),
                getLlmTimeoutMs(),
                "LLM_TIMEOUT"
              );
              hybridAnswer.narrative = narrativeResponse.content;
              recordSuccess();
              console.log(`[PMO-Bot] OWNER_DELAYED_PROJECTS narrative generated successfully`);
            } catch (llmError) {
              const errMsg = llmError instanceof Error ? llmError.message : String(llmError);
              console.warn(`[PMO-Bot] LLM narrative failed:`, errMsg);
              recordFailure();
              hybridAnswer.narrative_error = {
                error_code: errMsg === "LLM_TIMEOUT" ? "LLM_TIMEOUT" : "LLM_UNAVAILABLE",
                request_id: requestId
              };
            }
          } else if (isCircuitOpen()) {
            hybridAnswer.narrative_error = {
              error_code: "CIRCUIT_OPEN",
              request_id: requestId
            };
          }

          // Format response content as JSON for frontend to parse
          response = {
            content: JSON.stringify(hybridAnswer),
            citations: hybridAnswer.evidence_refs.map(ref => ({ type: ref.type, id: ref.id })),
          };
          responseMode = "DETERMINISTIC";
          console.log(`[PMO-Bot] OWNER_DELAYED_PROJECTS: ${hybridAnswer.count} projects, ${hybridAnswer.delayed_count} delayed`);
        } catch (dbError) {
          console.error(`[PMO-Bot] OWNER_DELAYED_PROJECTS error:`, dbError);
          responseMode = "LLM";
          response = { content: "", citations: [] };
        }
      }
      // Check if this is a deterministic route (DB-only answer)
      else if (isDeterministicRoute(routeResult.route)) {
        try {
          const deterministicAnswer = await generateDeterministicAnswer(routeResult);
          response = {
            content: deterministicAnswer.content,
            citations: deterministicAnswer.citations,
          };
          responseMode = "DETERMINISTIC";
          console.log(`[PMO-Bot] Deterministic answer for route=${routeResult.route}, matched=${deterministicAnswer.matchedItems}`);
        } catch (dbError) {
          console.error(`[PMO-Bot] Deterministic answer error:`, dbError);
          // Fall back to LLM if deterministic fails
          responseMode = "LLM";
          response = { content: "", citations: [] };
        }
      } else {
        response = { content: "", citations: [] };
      }

      // If not deterministic or deterministic failed, use LLM
      if (responseMode === "LLM") {
        // Check circuit breaker
        if (isCircuitOpen()) {
          const circuitStatus = getCircuitStatus();
          console.warn(`[PMO-Bot] Circuit breaker OPEN, ${circuitStatus.secondsUntilReset}s until reset`);
          errorCode = "CIRCUIT_OPEN";
          responseMode = "ERROR";
          response = {
            content: `El servicio de IA está temporalmente no disponible. Por favor intenta de nuevo en ${circuitStatus.secondsUntilReset} segundos.`,
            citations: [],
          };
        } else {
          // Get context for PMO Bot using single source of truth
          const portfolioView = await getCurrentPortfolioView();

          // Convert PortfolioItems to Project-compatible format for ChatContext
          const projectsForContext = portfolioView.items.map(item => ({
            id: item.id,
            projectName: item.title,
            status: item.status,
            departmentName: item.departmentName,
            responsible: item.responsible,
            sponsor: item.sponsor,
            percentComplete: item.percentComplete,
            startDate: item.startDate,
            endDateEstimated: item.endDateEstimated,
            endDateEstimatedTbd: item.endDateEstimatedTbd,
            priority: item.priority,
            description: item.description,
            parsedStatus: item.parsedStatus,
            parsedNextSteps: item.parsedNextSteps,
            estatusAlDia: item.estatusAlDia,
            extraFields: item.extraFields,
          })) as Project[];

          const context: ChatContext = {
            projects: projectsForContext,
            versionId: latestVersion?.id || null,
            versionFileName: latestVersion?.fileName || null,
          };

          // Try LLM with timeout and retry
          let llmSuccess = false;
          for (let attempt = 1; attempt <= 2 && !llmSuccess; attempt++) {
            try {
              const llmResponse = await withTimeout(
                generatePMOBotResponse(content, context),
                getLlmTimeoutMs(),
                "LLM_TIMEOUT"
              );
              response = llmResponse;
              responseMode = "LLM";
              llmSuccess = true;
              recordSuccess();
              console.log(`[PMO-Bot] LLM response success on attempt ${attempt}`);
            } catch (llmError) {
              const errMsg = llmError instanceof Error ? llmError.message : String(llmError);
              console.error(`[PMO-Bot] LLM attempt ${attempt} failed:`, errMsg);

              if (attempt === 2) {
                recordFailure();
                errorCode = errMsg === "LLM_TIMEOUT" ? "LLM_TIMEOUT" : "LLM_ERROR";
                responseMode = "ERROR";
                response = {
                  content: `Lo siento, no pude procesar tu consulta. (Error Técnico: ${errMsg}). Por favor intenta de nuevo.`,
                  citations: [],
                };
              }
            }
          }
        }
      }

      // Save assistant message
      const assistantMessage = await storage.createChatMessage({
        role: "assistant",
        content: response.content,
        citations: response.citations,
        versionContext: latestVersion?.id,
      });

      // Calculate latency
      const latencyMs = Date.now() - startTime;

      // Return response with metadata
      res.json({
        message: assistantMessage,
        sourceVersion: latestVersion,
        meta: {
          requestId,
          mode: responseMode,
          route: routeResult.route,
          latencyMs,
          ...(errorCode && { errorCode }),
          ...(responseMode === "ERROR" && {
            status: "ERROR",
            messageUser: response.content,
          }),
        },
      });
    } catch (error) {
      console.error("Chat send error:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(200).json({
        message: {
          id: -1,
          role: "assistant",
          content: "Ocurrió un error inesperado. Por favor intenta de nuevo.",
          citations: [],
          createdAt: new Date().toISOString(),
        },
        meta: {
          requestId,
          mode: "ERROR",
          errorCode: "INTERNAL_ERROR",
          status: "ERROR",
          messageUser: "Ocurrió un error inesperado. Por favor intenta de nuevo.",
          errorDetail: errMsg,
        },
      });
    }
  });

  // TEMP: Auth disabled for testing
  app.delete("/api/chat/clear", async (req, res) => {
    try {
      await storage.clearChatMessages();
      res.json({ success: true });
    } catch (error) {
      console.error("Chat clear error:", error);
      res.status(500).json({ message: "Error clearing chat" });
    }
  });

  // ===== FILTER PRESETS =====
  const filterPresetSchema = z.object({
    name: z.string().min(1, "El nombre es requerido").max(100, "El nombre es demasiado largo"),
    filters: z.object({
      search: z.string(),
      status: z.string(),
      department: z.string(),
    }),
  });

  app.get("/api/filter-presets", async (req, res) => {
    try {
      const presets = await storage.getFilterPresets();
      res.json({ presets });
    } catch (error) {
      console.error("Filter presets error:", error);
      res.status(500).json({ message: "Error loading filter presets" });
    }
  });

  app.post("/api/filter-presets", isAuthenticated, async (req, res) => {
    try {
      const parseResult = filterPresetSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          message: parseResult.error.errors[0]?.message || "Invalid request"
        });
      }

      const preset = await storage.createFilterPreset(parseResult.data);
      res.json({ preset });
    } catch (error) {
      console.error("Create filter preset error:", error);
      res.status(500).json({ message: "Error creating filter preset" });
    }
  });

  app.delete("/api/filter-presets/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid preset ID" });
      }

      await storage.deleteFilterPreset(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete filter preset error:", error);
      res.status(500).json({ message: "Error deleting filter preset" });
    }
  });

  // ===== H1 DATA FOUNDATION - INGESTION =====

  // POST /api/ingest/upload - Upload file with idempotency check
  app.post("/api/ingest/upload", isAuthenticated, isEditor, uploadRateLimit, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileBuffer = req.file.buffer;
      const fileName = req.file.originalname;
      const fileSize = req.file.size;
      const mimeType = req.file.mimetype;

      // Calculate SHA-256 hash
      const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // Idempotency check: if file with same hash already committed, return NOOP
      const existingBatch = await storage.getIngestionBatchByHash(fileHash);
      if (existingBatch) {
        return res.json({
          success: true,
          noop: true,
          message: "Archivo ya procesado anteriormente",
          batchId: existingBatch.id,
          status: existingBatch.status,
        });
      }

      // Get user ID from authenticated session
      const authenticatedUser = req.user as Express.User;
      const userId = authenticatedUser?.id || null;

      // Create ingestion batch
      const batch = await storage.createIngestionBatch({
        sourceFileHash: fileHash,
        sourceFileName: fileName,
        status: "pending",
        totalRows: 0,
        processedRows: 0,
        hardErrorCount: 0,
        softErrorCount: 0,
        uploadedBy: userId,
      });

      // Store raw artifact
      await storage.createRawArtifact({
        batchId: batch.id,
        fileContent: fileBuffer,
        fileName: fileName,
        fileSize: fileSize,
        mimeType: mimeType,
        fileHash: fileHash,
      });

      // Update batch to processing
      await storage.updateIngestionBatchStatus(batch.id, "processing", 0, 0, 0);

      // Parse and validate the Excel file (this can create validation issues)
      let totalRows = 0;
      let hardErrorCount = 0;
      let softErrorCount = 0;
      const validationIssues: InsertValidationIssue[] = [];

      try {
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const projectsSheet = workbook.Sheets["Proyectos PGP"];

        if (!projectsSheet) {
          validationIssues.push({
            batchId: batch.id,
            severity: "hard",
            code: "SHEET_NOT_FOUND",
            rowNumber: null,
            columnName: null,
            rawValue: null,
            message: "La hoja 'Proyectos PGP' no fue encontrada en el archivo",
          });
          hardErrorCount = 1;
        } else {
          const jsonData = XLSX.utils.sheet_to_json(projectsSheet, { defval: "" });
          totalRows = jsonData.length;

          // Basic validation - count potential issues
          jsonData.forEach((row: unknown, index: number) => {
            const rowData = row as Record<string, unknown>;
            const rowNum = index + 2; // Account for header row

            // Check for missing project name (hard error)
            const projectName = rowData["PROYECTO"] || rowData["Proyecto"] || rowData["NOMBRE"] || rowData["Nombre"];
            if (!projectName || String(projectName).trim() === "") {
              validationIssues.push({
                batchId: batch.id,
                severity: "hard",
                code: "MISSING_PROJECT_NAME",
                rowNumber: rowNum,
                columnName: "PROYECTO",
                rawValue: null,
                message: `Fila ${rowNum}: Nombre del proyecto es requerido`,
              });
              hardErrorCount++;
            }

            // Check for invalid dates (soft error)
            const startDate = rowData["INICIO"] || rowData["Inicio"] || rowData["FECHA INICIO"];
            if (startDate && !isValidDate(String(startDate))) {
              validationIssues.push({
                batchId: batch.id,
                severity: "soft",
                code: "INVALID_DATE",
                rowNumber: rowNum,
                columnName: "INICIO",
                rawValue: String(startDate),
                message: `Fila ${rowNum}: Fecha de inicio inválida`,
              });
              softErrorCount++;
            }
          });
        }
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        validationIssues.push({
          batchId: batch.id,
          severity: "hard",
          code: "PARSE_ERROR",
          rowNumber: null,
          columnName: null,
          rawValue: null,
          message: `Error al parsear archivo: ${errorMessage}`,
        });
        hardErrorCount = 1;
      }

      // Persist all validation issues
      if (validationIssues.length > 0) {
        await storage.createValidationIssues(validationIssues);
      }

      // Update batch with final status
      const finalStatus = hardErrorCount > 0 ? "failed" : "committed";
      await storage.updateIngestionBatchStatus(batch.id, finalStatus, hardErrorCount, softErrorCount, totalRows);

      // Auto-enqueue jobs after successful ingestion
      if (finalStatus === "committed") {
        const jobsToEnqueue: Array<{ type: string, payload: Record<string, unknown> }> = [
          { type: "GENERATE_EXPORT_EXCEL", payload: { batchId: batch.id } },
          { type: "GENERATE_COMMITTEE_PACKET", payload: { batchId: batch.id } },
          { type: "DETECT_LIMBO", payload: {} },
          { type: "DRAFT_CHASERS", payload: { batchId: batch.id } },
        ];

        for (const job of jobsToEnqueue) {
          const hasPending = await storage.hasPendingJobByType(job.type);
          if (!hasPending) {
            await enqueueJob(job.type as any, job.payload);
            console.log(`[Ingestion] Auto-enqueued ${job.type} for batch ${batch.id}`);
          }
        }

        // GENERATE_SYSTEM_DOCS once per day max
        const lastDocsJob = await storage.getLastSuccessfulJobByType("GENERATE_SYSTEM_DOCS");
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (!lastDocsJob || new Date(lastDocsJob.createdAt) < oneDayAgo) {
          const hasPendingDocs = await storage.hasPendingJobByType("GENERATE_SYSTEM_DOCS");
          if (!hasPendingDocs) {
            await enqueueJob("GENERATE_SYSTEM_DOCS" as any, {});
            console.log(`[Ingestion] Auto-enqueued GENERATE_SYSTEM_DOCS (daily)`);
          }
        }
      }

      // Reload batch for response
      const updatedBatch = await storage.getIngestionBatch(batch.id);

      res.json({
        success: hardErrorCount === 0,
        noop: false,
        batchId: batch.id,
        status: finalStatus,
        totalRows,
        hardErrorCount,
        softErrorCount,
        message: hardErrorCount > 0
          ? `Archivo procesado con ${hardErrorCount} errores críticos`
          : `Archivo procesado exitosamente con ${softErrorCount} advertencias`,
      });
    } catch (error) {
      console.error("Ingest upload error:", error instanceof Error ? error.message : String(error));
      res.status(500).json({ message: "Error al procesar el archivo" });
    }
  });

  // Helper function to validate dates
  function isValidDate(dateStr: string): boolean {
    if (!dateStr || dateStr.trim() === "" || dateStr.toLowerCase() === "tbd") return true;
    const parsed = Date.parse(dateStr);
    return !isNaN(parsed);
  }

  // GET /api/ingest/batches - List all ingestion batches with artifact info
  app.get("/api/ingest/batches", async (req, res) => {
    try {
      const batches = await storage.getIngestionBatches();

      // Enrich batches with artifact info for download functionality
      const batchesWithArtifacts = await Promise.all(
        batches.map(async (batch) => {
          const artifacts = await storage.getRawArtifactsByBatchId(batch.id);
          const primaryArtifact = artifacts[0]; // Usually one artifact per batch
          return {
            ...batch,
            artifactId: primaryArtifact?.id ?? null,
            artifactFileName: primaryArtifact?.fileName ?? null,
          };
        })
      );

      res.json({ batches: batchesWithArtifacts });
    } catch (error) {
      console.error("Get ingestion batches error:", error);
      res.status(500).json({ message: "Error loading batches" });
    }
  });

  // GET /api/ingest/batches/:id/issues - Get validation issues for a batch
  app.get("/api/ingest/batches/:id/issues", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid batch ID" });
      }

      const batch = await storage.getIngestionBatch(id);
      if (!batch) {
        return res.status(404).json({ message: "Batch not found" });
      }

      const issues = await storage.getValidationIssuesByBatchId(id);
      res.json({ batch, issues });
    } catch (error) {
      console.error("Get batch issues error:", error);
      res.status(500).json({ message: "Error loading validation issues" });
    }
  });

  // GET /api/ingest/artifacts/:id/download - Download raw artifact
  app.get("/api/ingest/artifacts/:id/download", isAuthenticated, isEditor, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid artifact ID" });
      }

      const artifact = await storage.getRawArtifact(id);
      if (!artifact) {
        return res.status(404).json({ message: "Artifact not found" });
      }

      // Audit log the download
      const user = req.user as Express.User;
      await storage.createDownloadAudit({
        userId: user?.id || null,
        artifactType: "RAW",
        artifactId: id,
        fileName: artifact.fileName,
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });

      // Set proper headers for file download
      res.setHeader("Content-Type", artifact.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${artifact.fileName}"`);
      res.setHeader("Content-Length", artifact.fileSize);

      // Send the binary content
      res.send(artifact.fileContent);
    } catch (error) {
      console.error("Download artifact error:", error);
      res.status(500).json({ message: "Error downloading artifact" });
    }
  });

  // ===== H2 CANONICAL DOMAIN MODEL - INITIATIVES =====

  // GET /api/initiatives - List all initiatives
  app.get("/api/initiatives", isAuthenticated, async (req, res) => {
    try {
      const initiatives = await storage.getInitiatives();
      res.json({ initiatives });
    } catch (error) {
      console.error("[Initiatives] Error fetching initiatives:", error);
      res.status(500).json({ message: "Error al obtener iniciativas" });
    }
  });

  // GET /api/initiatives/:id - Get initiative detail
  app.get("/api/initiatives/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const initiative = await storage.getInitiative(id);
      if (!initiative) {
        return res.status(404).json({ message: "Iniciativa no encontrada" });
      }

      // Get latest snapshot
      const snapshots = await storage.getSnapshotsByInitiativeId(id);
      const latestSnapshot = snapshots[0] || null;

      res.json({
        initiative,
        latestSnapshot,
        snapshotCount: snapshots.length
      });
    } catch (error) {
      console.error("[Initiatives] Error fetching initiative:", error);
      res.status(500).json({ message: "Error al obtener iniciativa" });
    }
  });

  // GET /api/initiatives/:id/snapshots - Get all snapshots for an initiative (history)
  app.get("/api/initiatives/:id/snapshots", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const initiative = await storage.getInitiative(id);
      if (!initiative) {
        return res.status(404).json({ message: "Iniciativa no encontrada" });
      }

      const snapshots = await storage.getSnapshotsByInitiativeId(id);

      res.json({
        initiative,
        snapshots,
        totalSnapshots: snapshots.length
      });
    } catch (error) {
      console.error("[Initiatives] Error fetching snapshots:", error);
      res.status(500).json({ message: "Error al obtener historial" });
    }
  });

  // ===== H3 DELTA ENGINE & GOVERNANCE ALERTS =====

  // GET /api/initiatives/:id/deltas - Get deltas for an initiative
  app.get("/api/initiatives/:id/deltas", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const deltas = await storage.getDeltasByInitiativeId(id, limit);

      res.json({ deltas });
    } catch (error) {
      console.error("[Deltas] Error fetching deltas:", error);
      res.status(500).json({ message: "Error al obtener cambios" });
    }
  });

  // GET /api/initiatives/:id/alerts - Get alerts for an initiative
  app.get("/api/initiatives/:id/alerts", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const alerts = await storage.getAlertsByInitiativeId(id);

      res.json({ alerts });
    } catch (error) {
      console.error("[Alerts] Error fetching alerts:", error);
      res.status(500).json({ message: "Error al obtener alertas" });
    }
  });

  // GET /api/alerts - Get all alerts (optionally filtered by status)
  app.get("/api/alerts", isAuthenticated, async (req, res) => {
    try {
      const status = req.query.status as string;

      let alerts;
      if (status === "OPEN") {
        alerts = await storage.getOpenAlerts();
      } else {
        alerts = await storage.getOpenAlerts();
      }

      // Enrich alerts with initiative titles
      const enrichedAlerts = await Promise.all(
        alerts.map(async (alert) => {
          const initiative = await storage.getInitiative(alert.initiativeId);
          return {
            ...alert,
            initiativeTitle: initiative?.title || "Iniciativa desconocida",
          };
        })
      );

      res.json({ alerts: enrichedAlerts });
    } catch (error) {
      console.error("[Alerts] Error fetching alerts:", error);
      res.status(500).json({ message: "Error al obtener alertas" });
    }
  });

  // ===== H4 EXPORTS =====

  // POST /api/exports/run - Enqueue GENERATE_EXPORT_EXCEL job
  app.post("/api/exports/run", isAuthenticated, isEditor, exportRateLimit, async (req, res) => {
    try {
      const user = req.user as Express.User;
      const filterCriteria = req.body.filterCriteria || {};

      const job = await storage.createJob({
        jobType: "GENERATE_EXPORT_EXCEL",
        payload: {
          requestedBy: user.id,
          filterCriteria,
        },
      });

      res.status(201).json({
        jobId: job.id,
        message: "Exportación encolada correctamente"
      });
    } catch (error) {
      console.error("[Exports] Error enqueuing export job:", error);
      res.status(500).json({ message: "Error al encolar exportación" });
    }
  });

  // GET /api/exports - List export batches with latest artifact info
  app.get("/api/exports", isAuthenticated, async (req, res) => {
    try {
      const batches = await db.select()
        .from(exportBatches)
        .orderBy(desc(exportBatches.createdAt))
        .limit(50);

      const enrichedBatches = await Promise.all(
        batches.map(async (batch) => {
          const artifacts = await storage.getExportArtifactsByBatchId(batch.id);
          const latestArtifact = artifacts[0];
          return {
            ...batch,
            artifact: latestArtifact ? {
              id: latestArtifact.id,
              fileName: latestArtifact.fileName,
              fileSize: latestArtifact.fileSize,
              createdAt: latestArtifact.createdAt,
            } : null,
          };
        })
      );

      res.json({ exports: enrichedBatches });
    } catch (error) {
      console.error("[Exports] Error fetching exports:", error);
      res.status(500).json({ message: "Error al obtener exportaciones" });
    }
  });

  // GET /api/exports/:id/download - Download export artifact
  app.get("/api/exports/:id/download", isAuthenticated, isEditor, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const artifact = await storage.getExportArtifact(id);
      if (!artifact) {
        return res.status(404).json({ message: "Archivo no encontrado" });
      }

      // Audit log the download
      const user = req.user as Express.User;
      await storage.createDownloadAudit({
        userId: user?.id || null,
        artifactType: "EXPORT",
        artifactId: id,
        fileName: artifact.fileName,
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });

      res.setHeader("Content-Type", artifact.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${artifact.fileName}"`);
      res.setHeader("Content-Length", artifact.fileSize);
      res.send(artifact.fileContent);
    } catch (error) {
      console.error("[Exports] Error downloading export:", error);
      res.status(500).json({ message: "Error al descargar archivo" });
    }
  });

  // ===== H4 COMMITTEE PACKETS =====

  // POST /api/committee/run - Enqueue GENERATE_COMMITTEE_PACKET job
  app.post("/api/committee/run", isAuthenticated, isEditor, exportRateLimit, async (req, res) => {
    try {
      const job = await storage.createJob({
        jobType: "GENERATE_COMMITTEE_PACKET",
        payload: {},
      });

      res.status(201).json({
        jobId: job.id,
        message: "Generación de paquete de comité encolada"
      });
    } catch (error) {
      console.error("[Committee] Error enqueuing committee packet job:", error);
      res.status(500).json({ message: "Error al encolar generación de paquete" });
    }
  });

  // GET /api/committee/packets - List committee packets
  app.get("/api/committee/packets", isAuthenticated, async (req, res) => {
    try {
      const packets = await storage.getCommitteePackets();

      const enrichedPackets = packets.map(packet => ({
        ...packet,
        initiativeCount: packet.summaryJson?.initiativeCount || 0,
      }));

      res.json({ packets: enrichedPackets });
    } catch (error) {
      console.error("[Committee] Error fetching packets:", error);
      res.status(500).json({ message: "Error al obtener paquetes de comité" });
    }
  });

  // GET /api/committee/packets/:id - Get single packet with full summaryJson
  app.get("/api/committee/packets/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const packet = await storage.getCommitteePacket(id);
      if (!packet) {
        return res.status(404).json({ message: "Paquete no encontrado" });
      }

      res.json({ packet });
    } catch (error) {
      console.error("[Committee] Error fetching packet:", error);
      res.status(500).json({ message: "Error al obtener paquete de comité" });
    }
  });

  // ===== H4 CHASER DRAFTS =====

  // GET /api/chasers - List all chaser drafts
  app.get("/api/chasers", isAuthenticated, async (req, res) => {
    try {
      const drafts = await storage.getChaserDrafts();

      // Enrich with initiative titles
      const enrichedDrafts = await Promise.all(
        drafts.map(async (draft) => {
          const initiative = await storage.getInitiative(draft.initiativeId);
          return {
            ...draft,
            initiativeTitle: initiative?.title || "Iniciativa desconocida",
          };
        })
      );

      res.json({ chasers: enrichedDrafts });
    } catch (error) {
      console.error("[Chasers] Error fetching chasers:", error);
      res.status(500).json({ message: "Error al obtener borradores de seguimiento" });
    }
  });

  // GET /api/initiatives/:id/chasers - Get chasers for specific initiative
  app.get("/api/initiatives/:id/chasers", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const initiative = await storage.getInitiative(id);
      if (!initiative) {
        return res.status(404).json({ message: "Iniciativa no encontrada" });
      }

      const chasers = await storage.getChaserDraftsByInitiative(id);

      res.json({
        initiative: { id: initiative.id, title: initiative.title },
        chasers
      });
    } catch (error) {
      console.error("[Chasers] Error fetching initiative chasers:", error);
      res.status(500).json({ message: "Error al obtener borradores de seguimiento" });
    }
  });

  // ===== H4 JOB STATUS =====

  // GET /api/jobs/recent - Get recent jobs for system status page
  app.get("/api/jobs/recent", isAuthenticated, isEditor, async (req, res) => {
    try {
      const recentJobs = await storage.getRecentJobs(20);
      res.json({ jobs: recentJobs });
    } catch (error) {
      console.error("[Jobs] Error fetching recent jobs:", error);
      res.status(500).json({ message: "Error al obtener trabajos recientes" });
    }
  });

  // POST /api/jobs/enqueue-detect-limbo - Enqueue DETECT_LIMBO job
  app.post("/api/jobs/enqueue-detect-limbo", isAuthenticated, isEditor, async (req, res) => {
    try {
      const hasPending = await storage.hasPendingJobByType("DETECT_LIMBO");
      if (hasPending) {
        return res.status(409).json({ message: "Ya existe un trabajo DETECT_LIMBO pendiente" });
      }

      const jobId = await enqueueJob("DETECT_LIMBO", {});
      res.status(201).json({ jobId, message: "Trabajo de detección de limbo encolado" });
    } catch (error) {
      console.error("[Jobs] Error enqueueing DETECT_LIMBO:", error);
      res.status(500).json({ message: "Error al encolar trabajo" });
    }
  });

  // GET /api/jobs/:id - Get job status and runs for polling
  app.get("/api/jobs/:id", isAuthenticated, isEditor, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
      if (!job) {
        return res.status(404).json({ message: "Trabajo no encontrado" });
      }

      const runs = await db.select()
        .from(jobRuns)
        .where(eq(jobRuns.jobId, id))
        .orderBy(desc(jobRuns.startedAt));

      res.json({ job, runs });
    } catch (error) {
      console.error("[Jobs] Error fetching job status:", error);
      res.status(500).json({ message: "Error al obtener estado del trabajo" });
    }
  });

  // ===== H5 Agent Routes =====

  // Get agent health status
  app.get("/api/agents/health", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check API keys (Replit AI Integrations)
      const openaiKey = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const anthropicKey = !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
      const googleKey = !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

      const keys = {
        openai: { name: "OpenAI (GPT)", configured: openaiKey },
        anthropic: { name: "Anthropic (Claude)", configured: anthropicKey },
        google: { name: "Google (Gemini)", configured: googleKey },
      };

      // Get all agent definitions
      const agentDefs = await storage.getAgentDefinitions();
      const agents = agentDefs.map(a => ({
        name: a.name,
        enabled: a.enabled,
        purpose: a.purpose,
      }));

      // Calculate overall health
      // healthy = OpenAI configured (required) and at least 1 agent enabled
      // degraded = OpenAI configured but missing secondary keys or no agents
      // unhealthy = OpenAI not configured
      let overall: "healthy" | "degraded" | "unhealthy";
      const enabledAgents = agents.filter(a => a.enabled).length;

      if (!openaiKey) {
        overall = "unhealthy";
      } else if (!anthropicKey || !googleKey || enabledAgents === 0) {
        overall = "degraded";
      } else {
        overall = "healthy";
      }

      res.json({
        overall,
        keys,
        agents,
        enabledCount: enabledAgents,
        totalCount: agents.length,
      });
    } catch (error) {
      console.error("[Agents] Error fetching health:", error);
      res.status(500).json({ message: "Error al obtener estado de salud" });
    }
  });

  // Smoke test - run CommitteeBriefAgent on first initiative
  app.post("/api/agents/smoke-test", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();

      // Find first initiative - auto-backfill from projects if empty
      let initiativesList = await storage.getInitiatives();
      if (initiativesList.length === 0) {
        // Auto-backfill from legacy projects table (idempotent)
        const backfillResult = await storage.backfillInitiativesFromProjects();
        console.log(`[Agents] Auto-backfill completed: ${backfillResult.initiativesCreated} initiatives, ${backfillResult.snapshotsCreated} snapshots`);

        // Retry getting initiatives after backfill
        initiativesList = await storage.getInitiatives();
        if (initiativesList.length === 0) {
          // Still no data - return success with empty status
          return res.json({
            status: "OK_EMPTY",
            message: "No hay datos de proyectos para backfill",
            duration: Date.now() - startTime,
          });
        }
      }

      const initiative = initiativesList[0];

      // Run CommitteeBriefAgent
      const { runAgent } = await import("./services/agentRunner");
      const result = await runAgent("CommitteeBriefAgent", initiative.id);

      const duration = Date.now() - startTime;

      res.json({
        runId: result.runId,
        status: result.status,
        duration,
        initiativeId: initiative.id,
        initiativeName: initiative.title,
        blockedReason: result.blockedReason,
      });
    } catch (error) {
      console.error("[Agents] Smoke test error:", error);
      const message = error instanceof Error ? error.message : "Error en smoke test";
      res.status(500).json({ message, status: "ERROR" });
    }
  });

  // Get all agent definitions
  app.get("/api/agents", isAuthenticated, isEditor, async (req: Request, res: Response) => {
    try {
      const { getAgentFleetStatus } = await import("./services/agentFleet");
      const status = await getAgentFleetStatus();
      res.json(status.agents);
    } catch (error) {
      console.error("[Agents] Error fetching agents:", error);
      res.status(500).json({ message: "Error al obtener agentes" });
    }
  });

  // Seed agent fleet
  app.post("/api/agents/seed", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const { seedAgentFleet } = await import("./services/agentFleet");
      const result = await seedAgentFleet();
      res.json(result);
    } catch (error) {
      console.error("[Agents] Error seeding agents:", error);
      res.status(500).json({ message: "Error al inicializar agentes" });
    }
  });

  // Run an agent on an initiative
  app.post("/api/agents/:name/run", isAuthenticated, isEditor, agentRateLimit, async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const { initiativeId } = req.body;

      if (!initiativeId || typeof initiativeId !== "number") {
        return res.status(400).json({ message: "initiativeId es requerido" });
      }

      const { runAgent } = await import("./services/agentRunner");
      const result = await runAgent(name, initiativeId);
      res.json(result);
    } catch (error) {
      console.error("[Agents] Error running agent:", error);
      const message = error instanceof Error ? error.message : "Error al ejecutar agente";
      res.status(500).json({ message });
    }
  });

  // Get agent run details
  app.get("/api/agents/runs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const { getAgentRunWithReviews } = await import("./services/agentRunner");
      const result = await getAgentRunWithReviews(id);

      if (!result.run) {
        return res.status(404).json({ message: "Ejecución no encontrada" });
      }

      res.json(result);
    } catch (error) {
      console.error("[Agents] Error fetching run:", error);
      res.status(500).json({ message: "Error al obtener ejecución" });
    }
  });

  // ===== H5 System Docs Routes =====

  // Get system docs
  app.get("/api/system/docs", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const docs = await storage.getSystemDocs();
      res.json(docs);
    } catch (error) {
      console.error("[SystemDocs] Error fetching docs:", error);
      res.status(500).json({ message: "Error al obtener documentación" });
    }
  });

  // Get single system doc
  app.get("/api/system/docs/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const doc = await storage.getSystemDoc(id);
      if (!doc) {
        return res.status(404).json({ message: "Documento no encontrado" });
      }

      res.json(doc);
    } catch (error) {
      console.error("[SystemDocs] Error fetching doc:", error);
      res.status(500).json({ message: "Error al obtener documento" });
    }
  });

  // Generate system docs (enqueue job)
  app.post("/api/system/docs/run", isAdmin, systemDocsRateLimit, async (req: Request, res: Response) => {
    try {
      const jobId = await enqueueJob("GENERATE_SYSTEM_DOCS" as any, {});
      res.json({ jobId, message: "Generación de documentación encolada" });
    } catch (error) {
      console.error("[SystemDocs] Error enqueuing job:", error);
      res.status(500).json({ message: "Error al encolar generación" });
    }
  });

  // ===== H6 Orchestrator Routes =====

  // POST /api/orchestrator/bounce - PMO Bot Orchestrator
  app.post("/api/orchestrator/bounce", isAuthenticated, isEditor, agentRateLimit, async (req: Request, res: Response) => {
    try {
      const validation = orchestratorRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Datos inválidos",
          errors: validation.error.errors,
        });
      }

      const result = await runOrchestrator(validation.data);
      res.json(result);
    } catch (error) {
      console.error("[Orchestrator] Error:", error);
      res.status(500).json({ message: "Error al procesar solicitud del orquestador" });
    }
  });

  // ===== H6.4 Eval Harness Routes =====

  // POST /api/evals/run - Run evaluation suite (admin only)
  app.post("/api/evals/run", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const { runEvalSuite } = await import("./services/evalRunner");
      const results = await runEvalSuite();
      res.json(results);
    } catch (error) {
      console.error("[Evals] Error running eval suite:", error);
      res.status(500).json({ message: "Error al ejecutar suite de evaluación" });
    }
  });

  // GET /api/evals/recent - Get recent eval runs (editor access)
  app.get("/api/evals/recent", isAuthenticated, isEditor, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const runs = await storage.getRecentEvalRuns(limit);
      res.json(runs);
    } catch (error) {
      console.error("[Evals] Error fetching recent runs:", error);
      res.status(500).json({ message: "Error al obtener ejecuciones recientes" });
    }
  });

  // ===== PILAR Output Activation Pack Routes =====

  // GET /api/outputs/summary - Direct DB queries for accurate stats
  app.get("/api/outputs/summary", isAuthenticated, isEditor, async (req: Request, res: Response) => {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Get queue stats from DB directly
      const queueStats = await storage.getJobQueueStats(oneDayAgo);

      // Get latest successful jobs with artifact details
      const latestExport = await storage.getLatestExportArtifact();
      const latestPacket = await storage.getLatestCompletedCommitteePacket();
      const chaserCount = await storage.getChaserDraftsCount();
      const alertsCount = await storage.getOpenAlertsCount();
      const latestDocs = await storage.getLatestSystemDocEntry();

      // Get failed jobs with error details
      const failedJobsRaw = await storage.getFailedJobsInWindow(oneDayAgo);
      const failedJobs = failedJobsRaw.map(j => ({
        id: j.id,
        jobType: j.jobType,
        status: j.status,
        errorCode: (j.payload as any)?.errorCode || null,
        lastError: j.lastError || null,
        requestId: (j.payload as any)?.requestId || null,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      }));

      // Build summary for job types (legacy compatibility)
      const outputTypes = [
        "GENERATE_EXPORT_EXCEL",
        "GENERATE_COMMITTEE_PACKET",
        "DETECT_LIMBO",
        "DRAFT_CHASERS",
        "GENERATE_SYSTEM_DOCS",
      ];

      const summary: Record<string, any> = {};
      for (const jobType of outputTypes) {
        const lastSuccess = await storage.getLastSuccessfulJobByType(jobType);
        const hasPending = await storage.hasPendingJobByType(jobType);

        summary[jobType] = {
          lastSuccess: lastSuccess ? {
            id: lastSuccess.id,
            completedAt: lastSuccess.updatedAt,
            output: lastSuccess.payload,
          } : null,
          hasPending,
        };
      }

      res.json({
        summary,
        queueStats,
        failedJobs,
        artifacts: {
          export: latestExport ? {
            id: latestExport.id,
            fileName: latestExport.fileName,
            fileSize: latestExport.fileSize,
            createdAt: latestExport.createdAt,
            downloadUrl: `/api/exports/${latestExport.batchId}/download`,
          } : null,
          packet: latestPacket ? {
            id: latestPacket.id,
            status: latestPacket.status,
            createdAt: latestPacket.createdAt,
            initiativeCount: (latestPacket.summaryJson as any)?.initiativeCount || 0,
            viewUrl: `/api/committee/${latestPacket.id}`,
          } : null,
          docs: latestDocs ? {
            id: latestDocs.id,
            docType: latestDocs.docType,
            createdAt: latestDocs.generatedAt,
          } : null,
        },
        counts: {
          openAlerts: alertsCount,
          chaserDrafts: chaserCount,
        },
      });
    } catch (error) {
      console.error("[Outputs] Error fetching summary:", error);
      res.status(500).json({ message: "Error al obtener resumen de outputs" });
    }
  });

  // POST /api/outputs/rerun/:jobType - Re-run a specific job type (with dedupe)
  app.post("/api/outputs/rerun/:jobType", isAuthenticated, isEditor, async (req: Request, res: Response) => {
    try {
      const { jobType } = req.params;

      const validTypes = [
        "GENERATE_EXPORT_EXCEL",
        "GENERATE_COMMITTEE_PACKET",
        "DETECT_LIMBO",
        "DRAFT_CHASERS",
        "GENERATE_SYSTEM_DOCS",
      ];

      if (!validTypes.includes(jobType)) {
        return res.status(400).json({ message: `Tipo de job inválido: ${jobType}` });
      }

      const hasPending = await storage.hasPendingJobByType(jobType);
      if (hasPending) {
        return res.status(409).json({
          message: `Ya existe un job de tipo ${jobType} en cola o ejecutándose`,
          alreadyQueued: true,
        });
      }

      const jobId = await enqueueJob(jobType as any, {});
      console.log(`[Outputs] Manual rerun enqueued: ${jobType}, jobId: ${jobId}`);

      res.json({
        success: true,
        jobId,
        message: `Job ${jobType} encolado exitosamente`,
      });
    } catch (error) {
      console.error("[Outputs] Error rerunning job:", error);
      res.status(500).json({ message: "Error al encolar job" });
    }
  });

  // ===== AI Brief Agent Route =====

  // POST /api/agent/brief - Run AI brief on top initiatives
  app.post("/api/agent/brief", isAuthenticated, isEditor, agentRateLimit, async (req: Request, res: Response) => {
    try {
      const snapshots = await storage.getLatestSnapshotPerInitiative();

      // Sort by ranking (lower = higher priority) or fall back to all if no ranking
      let sorted = snapshots
        .filter(s => s.ranking !== null)
        .sort((a, b) => (a.ranking || 999) - (b.ranking || 999))
        .slice(0, 3);

      // If no ranked initiatives, take the most recent ones
      if (sorted.length === 0) {
        sorted = snapshots.slice(0, 3);
      }

      if (sorted.length === 0) {
        return res.json({
          status: "NO_DATA",
          message_user: "No hay iniciativas cargadas. Sube un Excel o crea una iniciativa de prueba.",
          next_actions: [
            { action: "UPLOAD_EXCEL", path: "/upload" },
            { action: "CREATE_SEED", path: "/system" }
          ]
        });
      }

      const { runAgent } = await import("./services/agentRunner");

      const results = [];
      for (const snapshot of sorted) {
        const result = await runAgent("CommitteeBriefAgent", snapshot.initiativeId);
        results.push({
          initiativeId: snapshot.initiativeId,
          title: snapshot.title,
          runId: result.runId,
          status: result.status,
          output: result.outputJson,
          blockedReason: result.blockedReason,
        });
      }

      res.json({
        success: true,
        results,
        hasBlocked: results.some(r => r.status === "BLOCKED"),
      });
    } catch (error) {
      console.error("[Agent] Brief error:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Error al ejecutar brief IA" });
    }
  });

  // ===== H7.5 Soft Data Reset Routes =====

  // POST /api/admin/seed-initiative - Create a test initiative (idempotent)
  app.post("/api/admin/seed-initiative", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const SEED_KEY = "TEST_SEED_INITIATIVE_001";

      // Check if seed initiative already exists (idempotent)
      const existing = await storage.findInitiativeByDevopsCardId(SEED_KEY);
      if (existing) {
        const snapshots = await storage.getSnapshotsByInitiativeId(existing.id);
        return res.json({
          success: true,
          created: false,
          message: "La iniciativa de prueba ya existe",
          initiative_id: existing.id,
          snapshot_id: snapshots[0]?.id || null,
          initiative_link: `/initiatives/${existing.id}`,
        });
      }

      // Create seed ingestion batch for the snapshot
      const seedBatch = await storage.createIngestionBatch({
        sourceFileHash: "SEED_BATCH_" + Date.now(),
        sourceFileName: "seed-initiative.json",
        status: "committed",
        totalRows: 1,
        processedRows: 1,
        hardErrorCount: 0,
        softErrorCount: 0,
      });

      // Create seed initiative (only fields that exist on initiatives table)
      const initiative = await storage.createInitiative({
        devopsCardId: SEED_KEY,
        powerSteeringId: null,
        title: "Iniciativa de Prueba PMO",
        owner: "Administrador",
        currentStatus: "Abierto",
      });

      // Create initial snapshot (using correct field names from initiativeSnapshots table)
      const snapshot = await storage.createInitiativeSnapshot({
        initiativeId: initiative.id,
        batchId: seedBatch.id,
        title: initiative.title,
        description: "Iniciativa creada automáticamente para probar el sistema de agentes",
        owner: initiative.owner,
        status: "Abierto",
        percentComplete: 25,
        endDateEstimated: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        ranking: 1,
        totalValor: 80,
        totalEsfuerzo: 40,
        puntajeTotal: 120,
      });

      console.log(`[Admin] Created seed initiative: ${initiative.id}, snapshot: ${snapshot.id}`);

      res.json({
        success: true,
        created: true,
        message: "Iniciativa de prueba creada exitosamente",
        initiative_id: initiative.id,
        snapshot_id: snapshot.id,
        initiative_link: `/initiatives/${initiative.id}`,
      });
    } catch (error) {
      console.error("[Admin] Error creating seed initiative:", error);
      res.status(500).json({
        success: false,
        message: "Error al crear iniciativa de prueba",
      });
    }
  });

  // POST /api/admin/backfill-initiatives - Backfill initiatives from legacy projects
  app.post("/api/admin/backfill-initiatives", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const result = await storage.backfillInitiativesFromProjects();
      console.log(`[Admin] Backfill completed: ${result.initiativesCreated} initiatives, ${result.snapshotsCreated} snapshots`);

      res.json({
        success: true,
        initiatives_created: result.initiativesCreated,
        snapshots_created: result.snapshotsCreated,
        message: `Se crearon ${result.initiativesCreated} iniciativas y ${result.snapshotsCreated} snapshots`,
      });
    } catch (error) {
      console.error("[Admin] Error during backfill:", error);
      res.status(500).json({
        success: false,
        message: "Error al realizar el backfill de iniciativas",
      });
    }
  });

  // POST /api/admin/reset-data - Truncate operational tables (admin only)
  app.post("/api/admin/reset-data", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      console.log("[Admin] Starting soft data reset...");
      const result = await storage.resetOperationalData();
      console.log(`[Admin] Soft data reset completed. Tables cleared: ${result.tablesCleared}`);
      res.json({
        success: true,
        tablesCleared: result.tablesCleared,
        message: `Se eliminaron los datos de ${result.tablesCleared} tablas operacionales`,
      });
    } catch (error) {
      console.error("[Admin] Error during soft data reset:", error);
      res.status(500).json({
        success: false,
        message: "Error al realizar el reset de datos operacionales"
      });
    }
  });

  return httpServer;
}
