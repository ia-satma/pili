import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import { parseExcelBuffer, type ParsedProject } from "./excel-parser";
import { generatePMOBotResponse, type ChatContext, isOpenAIConfigured } from "./openai";
import type { InsertChangeLog, InsertKpiValue, Project, InsertProject } from "@shared/schema";
import { setupAuth, isAuthenticated, isAdmin, isEditor, isViewer, seedAdminUsers } from "./replitAuth";

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

// Schema for creating individual projects
const createProjectSchema = z.object({
  projectName: z.string().min(1, "Nombre del proyecto es requerido"),
  description: z.string().optional().nullable(),
  departmentName: z.string().optional().nullable(),
  responsible: z.string().optional().nullable(),
  sponsor: z.string().optional().nullable(),
  status: z.string().default("Abierto"),
  priority: z.string().default("Media"),
  category: z.string().optional().nullable(),
  projectType: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDateEstimated: z.string().optional().nullable(),
  endDateEstimatedTbd: z.boolean().default(false),
  endDateActual: z.string().optional().nullable(),
  percentComplete: z.number().min(0).max(100).default(0),
  statusText: z.string().optional().nullable(),
  parsedStatus: z.string().optional().nullable(),
  parsedNextSteps: z.string().optional().nullable(),
  benefits: z.string().optional().nullable(),
  scope: z.string().optional().nullable(),
  risks: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
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

  // ===== AUTH ROUTES =====
  app.get("/api/auth/user", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "No autorizado" });
      }
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
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
          if (depto && depto !== "all" && project.departmentName !== depto) {
            return false;
          }
          if (analista && analista !== "all") {
            const extraFields = project.extraFields as Record<string, unknown> | null;
            const analyst = extraFields?.["Business Process Analyst"] as string | undefined;
            if (!analyst || analyst.trim() !== analista) {
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
        projects = projects.filter(p => p.departmentName === depto);
      }
      
      if (analista && analista !== "all") {
        projects = projects.filter(p => {
          const extra = (p.extraFields || {}) as Record<string, unknown>;
          const projectAnalyst = extra["Business Process Analyst"] as string | undefined;
          return projectAnalyst && projectAnalyst.trim() === analista;
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
      
      // Calculate category distribution
      const categoryCounts: Record<string, number> = {};
      allProjects.forEach(p => {
        const cat = p.category || "Sin categoría";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
      
      // Mock timeline data (in a real app, you'd aggregate from actual data)
      const now = new Date();
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now);
        date.setMonth(date.getMonth() - i);
        months.push({
          month: date.toLocaleDateString("es-MX", { month: "short" }),
          count: Math.floor(Math.random() * 10) + 5,
          closed: Math.floor(Math.random() * 5) + 2,
        });
      }
      
      // Mock completion rate trend
      const completionRate = months.map((m, i) => ({
        month: m.month,
        rate: 70 + Math.floor(Math.random() * 20),
      }));
      
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
      
      // On-time delivery calculation
      const onTimeDelivery = kpis.find(k => k.kpiName === "Entrega a Tiempo")?.kpiValue || "100%";
      
      res.json({
        kpis,
        projectsByMonth: months,
        projectsByCategory: Object.entries(categoryCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        completionRate,
        avgDuration,
        onTimeDelivery: parseInt(onTimeDelivery.replace("%", "")) || 100,
        totalBenefits: 0,
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
        allProjects = allProjects.filter(p => p.departmentName === depto);
      }
      
      if (analista && analista !== "all") {
        allProjects = allProjects.filter(p => {
          const extra = (p.extraFields || {}) as Record<string, unknown>;
          const projectAnalyst = extra["Business Process Analyst"] as string | undefined;
          return projectAnalyst && projectAnalyst.trim() === analista;
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

  app.post("/api/chat/send", isAuthenticated, async (req, res) => {
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
      
      // Get context for PMO Bot
      const allProjects = await storage.getProjects();
      const latestVersion = await storage.getLatestExcelVersion();
      
      const context: ChatContext = {
        projects: allProjects,
        versionId: latestVersion?.id || null,
        versionFileName: latestVersion?.fileName || null,
      };
      
      // Generate response
      let response;
      try {
        response = await generatePMOBotResponse(content, context);
      } catch (aiError) {
        console.error("AI error:", aiError);
        response = {
          content: "Lo siento, no pude procesar tu consulta en este momento. Por favor intenta de nuevo.",
          citations: [],
        };
      }
      
      // Save assistant message
      const assistantMessage = await storage.createChatMessage({
        role: "assistant",
        content: response.content,
        citations: response.citations,
        versionContext: latestVersion?.id,
      });
      
      res.json({
        message: assistantMessage,
        sourceVersion: latestVersion,
      });
    } catch (error) {
      console.error("Chat send error:", error);
      res.status(500).json({ message: "Error sending message" });
    }
  });

  app.delete("/api/chat/clear", isAuthenticated, isAdmin, async (req, res) => {
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

  return httpServer;
}
