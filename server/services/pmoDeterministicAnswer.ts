/**
 * PMO Deterministic Answer Service
 * Provides DB-only answers for simple queries without LLM
 * Uses portfolioView as single source of truth
 */

import { getCurrentPortfolioView, type PortfolioItem } from "./portfolioView";
import { normalizeKey, normalizedEquals, normalizedIncludes } from "./normalization";
import type { RouterResult } from "./pmoQueryRouter";

export interface DeterministicAnswer {
  content: string;
  citations: Array<{ projectId: number; projectName: string }>;
  mode: "DETERMINISTIC";
  matchedItems: number;
  queryType: string;
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
