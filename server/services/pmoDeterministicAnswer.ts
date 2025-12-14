/**
 * PMO Deterministic Answer Service
 * Provides DB-only answers for simple queries without LLM
 * Uses portfolioView as single source of truth
 */

import { getCurrentPortfolioView, type PortfolioItem } from "./portfolioView";
import { normalizeKey, normalizedEquals, normalizedIncludes } from "./normalization";
import { storage } from "../storage";
import type { RouterResult } from "./pmoQueryRouter";

export interface DeterministicAnswer {
  content: string;
  citations: Array<{ projectId: number; projectName: string }>;
  mode: "DETERMINISTIC";
  matchedItems: number;
  queryType: string;
}

export interface DelayedProjectInfo {
  id: number;
  title: string;
  status: string | null;
  department: string | null;
  end_date: string | null;
  is_delayed: boolean;
  delay_reasons: string[];
}

export interface OwnerDelayedProjectsAnswer {
  status: "OK" | "ERROR";
  mode: "DETERMINISTIC";
  owner_key: string;
  count: number;
  delayed_count: number;
  projects: DelayedProjectInfo[];
  evidence_refs: Array<{ type: string; id: number }>;
  narrative?: string;
  narrative_error?: { error_code: string; request_id: string };
}

/**
 * Find items by owner/responsible name
 * Matches against responsible field and Business Process Analyst in extraFields
 */
function findItemsByOwner(items: PortfolioItem[], normalizedOwnerKey: string): PortfolioItem[] {
  return items.filter(item => {
    // Check responsible field
    if (normalizedIncludes(item.responsible, normalizedOwnerKey)) {
      return true;
    }
    
    // Check Business Process Analyst in extraFields
    const analyst = item.extraFields?.["Business Process Analyst"] as string | undefined;
    if (analyst && normalizedIncludes(analyst, normalizedOwnerKey)) {
      return true;
    }
    
    // Check sponsor field
    if (normalizedIncludes(item.sponsor, normalizedOwnerKey)) {
      return true;
    }
    
    return false;
  });
}

/**
 * Find items by department name
 */
function findItemsByDepartment(items: PortfolioItem[], normalizedDeptKey: string): PortfolioItem[] {
  return items.filter(item => {
    return normalizedIncludes(item.departmentName, normalizedDeptKey);
  });
}

/**
 * Determine if a project is delayed based on multiple criteria:
 * 1. Traffic light is RED/YELLOW (estatusAlDia)
 * 2. Status is OPEN/IN_PROGRESS and end_date < today
 * 3. Has HIGH severity governance alerts
 */
function getDelayStatus(item: PortfolioItem, alertSeverities: Map<number, string[]>): { isDelayed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Check estatusAlDia (traffic light)
  if (item.estatusAlDia) {
    const lower = item.estatusAlDia.toLowerCase().trim();
    if (lower.includes("riesgo") || lower.includes("vencido") || lower === "delayed" || lower === "retrasado" || lower === "at risk") {
      reasons.push(`Estado al día: ${item.estatusAlDia}`);
    }
  }
  
  // Check if past due date with open status
  if (item.endDateEstimated && (item.canonicalStatus === "OPEN" || item.canonicalStatus === "IN_PROGRESS")) {
    const dueDate = new Date(item.endDateEstimated);
    dueDate.setHours(0, 0, 0, 0);
    if (dueDate < today) {
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      reasons.push(`Fecha límite vencida por ${daysOverdue} día${daysOverdue === 1 ? '' : 's'}`);
    }
  }
  
  // Check HIGH severity governance alerts
  const severities = alertSeverities.get(item.id) || [];
  if (severities.includes("HIGH")) {
    reasons.push("Alerta de gobernanza de alta severidad activa");
  }
  
  return { isDelayed: reasons.length > 0, reasons };
}

/**
 * Generate owner delayed projects answer
 */
export async function generateOwnerDelayedProjectsAnswer(
  routeResult: RouterResult
): Promise<OwnerDelayedProjectsAnswer> {
  const portfolioView = await getCurrentPortfolioView();
  const { items } = portfolioView;
  const ownerName = routeResult.params.ownerName || "";
  
  // Find projects by owner
  const ownerItems = items.filter(item => {
    if (normalizedIncludes(item.responsible, routeResult.normalizedKey)) return true;
    const analyst = item.extraFields?.["Business Process Analyst"] as string | undefined;
    if (analyst && normalizedIncludes(analyst, routeResult.normalizedKey)) return true;
    if (normalizedIncludes(item.sponsor, routeResult.normalizedKey)) return true;
    return false;
  });
  
  if (ownerItems.length === 0) {
    return {
      status: "OK",
      mode: "DETERMINISTIC",
      owner_key: ownerName,
      count: 0,
      delayed_count: 0,
      projects: [],
      evidence_refs: [],
    };
  }
  
  // Get governance alert severities for initiatives
  const alertSeverities = new Map<number, string[]>();
  for (const item of ownerItems) {
    if (item.source === 'initiative') {
      const alerts = await storage.getAlertsByInitiativeId(item.id);
      const openAlerts = alerts.filter(a => a.status === "OPEN");
      if (openAlerts.length > 0) {
        alertSeverities.set(item.id, openAlerts.map(a => a.severity));
      }
    }
  }
  
  // Build project info with delay detection
  const projects: DelayedProjectInfo[] = ownerItems.map(item => {
    const delayStatus = getDelayStatus(item, alertSeverities);
    return {
      id: item.id,
      title: item.title,
      status: item.status,
      department: item.departmentName,
      end_date: item.endDateEstimated,
      is_delayed: delayStatus.isDelayed,
      delay_reasons: delayStatus.reasons,
    };
  });
  
  const delayedCount = projects.filter(p => p.is_delayed).length;
  
  return {
    status: "OK",
    mode: "DETERMINISTIC",
    owner_key: ownerName,
    count: ownerItems.length,
    delayed_count: delayedCount,
    projects,
    evidence_refs: ownerItems.map(item => ({ type: item.source, id: item.id })),
  };
}

/**
 * Format a list of projects for display
 */
function formatProjectList(items: PortfolioItem[], limit: number = 10): string {
  if (items.length === 0) {
    return "";
  }
  
  const displayItems = items.slice(0, limit);
  const lines = displayItems.map((item, idx) => {
    const status = item.status || "Sin estado";
    const dept = item.departmentName || "Sin departamento";
    return `${idx + 1}. **${item.title}** (ID: ${item.id})\n   - Estado: ${status}\n   - Departamento: ${dept}`;
  });
  
  if (items.length > limit) {
    lines.push(`\n... y ${items.length - limit} proyectos más.`);
  }
  
  return lines.join("\n\n");
}

/**
 * Generate deterministic answer based on route result
 */
export async function generateDeterministicAnswer(routeResult: RouterResult): Promise<DeterministicAnswer> {
  const portfolioView = await getCurrentPortfolioView();
  const { items } = portfolioView;
  
  switch (routeResult.route) {
    case "TOTAL_COUNT": {
      return {
        content: `Actualmente hay **${items.length} proyectos** en el portafolio.`,
        citations: [],
        mode: "DETERMINISTIC",
        matchedItems: items.length,
        queryType: "TOTAL_COUNT",
      };
    }
    
    case "COUNT_BY_OWNER": {
      const ownerName = routeResult.params.ownerName || "";
      const matchedItems = findItemsByOwner(items, routeResult.normalizedKey);
      
      if (matchedItems.length === 0) {
        return {
          content: `No encontré proyectos asignados a "${ownerName}". Verifica que el nombre esté escrito correctamente.`,
          citations: [],
          mode: "DETERMINISTIC",
          matchedItems: 0,
          queryType: "COUNT_BY_OWNER",
        };
      }
      
      return {
        content: `**${ownerName}** tiene **${matchedItems.length} proyecto${matchedItems.length === 1 ? '' : 's'}** asignado${matchedItems.length === 1 ? '' : 's'}.`,
        citations: matchedItems.map(item => ({ projectId: item.id, projectName: item.title })),
        mode: "DETERMINISTIC",
        matchedItems: matchedItems.length,
        queryType: "COUNT_BY_OWNER",
      };
    }
    
    case "LIST_BY_OWNER": {
      const ownerName = routeResult.params.ownerName || "";
      const matchedItems = findItemsByOwner(items, routeResult.normalizedKey);
      
      if (matchedItems.length === 0) {
        return {
          content: `No encontré proyectos asignados a "${ownerName}". Verifica que el nombre esté escrito correctamente.`,
          citations: [],
          mode: "DETERMINISTIC",
          matchedItems: 0,
          queryType: "LIST_BY_OWNER",
        };
      }
      
      const list = formatProjectList(matchedItems);
      return {
        content: `**${ownerName}** tiene **${matchedItems.length} proyecto${matchedItems.length === 1 ? '' : 's'}**:\n\n${list}`,
        citations: matchedItems.map(item => ({ projectId: item.id, projectName: item.title })),
        mode: "DETERMINISTIC",
        matchedItems: matchedItems.length,
        queryType: "LIST_BY_OWNER",
      };
    }
    
    case "COUNT_BY_DEPARTMENT": {
      const deptName = routeResult.params.departmentName || "";
      const matchedItems = findItemsByDepartment(items, routeResult.normalizedKey);
      
      if (matchedItems.length === 0) {
        return {
          content: `No encontré proyectos en el departamento "${deptName}". Verifica que el nombre esté escrito correctamente.`,
          citations: [],
          mode: "DETERMINISTIC",
          matchedItems: 0,
          queryType: "COUNT_BY_DEPARTMENT",
        };
      }
      
      return {
        content: `El departamento **${deptName}** tiene **${matchedItems.length} proyecto${matchedItems.length === 1 ? '' : 's'}**.`,
        citations: matchedItems.map(item => ({ projectId: item.id, projectName: item.title })),
        mode: "DETERMINISTIC",
        matchedItems: matchedItems.length,
        queryType: "COUNT_BY_DEPARTMENT",
      };
    }
    
    case "LIST_BY_DEPARTMENT": {
      const deptName = routeResult.params.departmentName || "";
      const matchedItems = findItemsByDepartment(items, routeResult.normalizedKey);
      
      if (matchedItems.length === 0) {
        return {
          content: `No encontré proyectos en el departamento "${deptName}". Verifica que el nombre esté escrito correctamente.`,
          citations: [],
          mode: "DETERMINISTIC",
          matchedItems: 0,
          queryType: "LIST_BY_DEPARTMENT",
        };
      }
      
      const list = formatProjectList(matchedItems);
      return {
        content: `El departamento **${deptName}** tiene **${matchedItems.length} proyecto${matchedItems.length === 1 ? '' : 's'}**:\n\n${list}`,
        citations: matchedItems.map(item => ({ projectId: item.id, projectName: item.title })),
        mode: "DETERMINISTIC",
        matchedItems: matchedItems.length,
        queryType: "LIST_BY_DEPARTMENT",
      };
    }
    
    default:
      // Should not reach here for deterministic routes
      throw new Error(`Unsupported deterministic route: ${routeResult.route}`);
  }
}
