/**
 * PMO Query Router
 * Routes incoming messages to deterministic DB answers or LLM fallback
 * Patterns are designed for Spanish queries about project counts and lists
 */

import { normalizeKey } from "./normalization";

export type QueryRoute = 
  | "COUNT_BY_OWNER"     // "cuántos proyectos tiene X"
  | "LIST_BY_OWNER"      // "qué proyectos tiene X"
  | "COUNT_BY_DEPARTMENT"// "cuántos proyectos tiene el departamento X"
  | "LIST_BY_DEPARTMENT" // "qué proyectos tiene el departamento X"
  | "TOTAL_COUNT"        // "cuántos proyectos hay"
  | "OWNER_DELAYED_PROJECTS" // "proyectos de X y cuáles están demorados/vencidos y por qué"
  | "PORTFOLIO_RISKY"    // "proyectos riesgosos/zombies" - HIGH_COST + LOW_VALUE
  | "PORTFOLIO_QUICK_WINS" // "quick wins/oportunidades" - LOW_COST + HIGH_VALUE
  | "PORTFOLIO_ANALYSIS" // "analiza el portafolio" - Full matrix analysis
  | "FALLBACK_LLM";      // Complex queries requiring AI

export interface RouterResult {
  route: QueryRoute;
  params: {
    ownerName?: string;
    departmentName?: string;
  };
  normalizedKey: string;
  originalQuery: string;
}

// Pattern definitions for Spanish queries
const PATTERNS = {
  // Count queries by owner: "cuántos proyectos tiene marina", "cuantos proyectos tiene Marina Dávila"
  COUNT_BY_OWNER: /cu[aá]ntos\s+proyectos\s+tiene\s+(?!el\s+departamento\s+|el\s+area\s+|el\s+área\s+)(.+)/i,
  
  // List queries by owner: "qué proyectos tiene marina", "que proyectos tiene Marina"
  LIST_BY_OWNER: /(?:qu[eé]|cuales|cuáles)\s+proyectos\s+tiene\s+(?!el\s+departamento\s+|el\s+area\s+|el\s+área\s+)(.+)/i,
  
  // Count by department: "cuántos proyectos tiene el departamento de TI"
  COUNT_BY_DEPARTMENT: /cu[aá]ntos\s+proyectos\s+tiene\s+(?:el\s+)?(?:departamento|area|área)\s+(?:de\s+)?(.+)/i,
  
  // List by department: "qué proyectos tiene el departamento de TI"
  LIST_BY_DEPARTMENT: /(?:qu[eé]|cuales|cuáles)\s+proyectos\s+tiene\s+(?:el\s+)?(?:departamento|area|área)\s+(?:de\s+)?(.+)/i,
  
  // Total count: "cuántos proyectos hay", "cuantos proyectos tenemos"
  TOTAL_COUNT: /cu[aá]ntos\s+proyectos\s+(?:hay|tenemos|existen|son)/i,
  
  // Owner delayed projects: "proyectos que tiene marina y cuales estan demorados"
  // Matches: "cual es el nombre de los proyectos que tiene X y cuales estan demorados y porque"
  // Also: "dame los proyectos de X y cuales estan vencidos/atrasados"
  OWNER_DELAYED_PROJECTS: /(?:(?:cu[aá]l(?:es)?|qu[eé]|dame|dime|muestra|lista).*(?:proyectos?|nombre).*(?:tiene|de)\s+)(.+?)(?:\s+y\s+(?:cu[aá]l(?:es)?|qu[eé])?\s*(?:est[aá]n?|son)\s*(?:demorad|vencid|atrasad|retrasad|en\s*riesgo))/i,
  
  // Portfolio queries - risky/zombie projects
  // "cuales son los proyectos riesgosos", "proyectos zombie", "alto riesgo", "proyectos caros sin valor"
  PORTFOLIO_RISKY: /(?:proyectos?\s+)?(?:riesgos[oa]s?|zombie|zombi|alto\s*riesgo|caro.*sin\s*valor|sin\s*valor.*caro|alto\s*costo.*bajo\s*valor|high\s*cost.*low\s*value)/i,
  
  // Portfolio queries - quick wins
  // "quick wins", "oportunidades", "bajo costo alto valor", "proyectos faciles"
  PORTFOLIO_QUICK_WINS: /(?:quick\s*wins?|oportunidades?|bajo\s*costo.*alto\s*valor|faciles?.*alto\s*impacto|ganancia\s*rapida|victorias?\s*facil)/i,
  
  // Portfolio analysis - full matrix
  // "analiza el portafolio", "resumen del portafolio", "estado del portafolio", "matriz de proyectos"
  PORTFOLIO_ANALYSIS: /(?:analiz[ae]|resume|resumen|estado|matriz|vision\s*general|overview).*(?:portafolio|cartera|proyectos)/i,
};

/**
 * Clean extracted name from query
 * Removes trailing punctuation and common filler words
 */
function cleanExtractedName(name: string): string {
  return name
    .replace(/[?¿!¡.,;:]+$/g, '')  // Remove trailing punctuation
    .replace(/\s+$/g, '')           // Trim trailing whitespace
    .replace(/^\s+/g, '')           // Trim leading whitespace
    .replace(/\s+/g, ' ');          // Collapse multiple spaces
}

/**
 * Route a user message to the appropriate handler
 * Returns route type, extracted parameters, and normalized key for matching
 */
export function routePmoQuery(message: string): RouterResult {
  const trimmedMessage = message.trim();
  
  // Try OWNER_DELAYED_PROJECTS first (most specific pattern)
  const ownerDelayedMatch = trimmedMessage.match(PATTERNS.OWNER_DELAYED_PROJECTS);
  if (ownerDelayedMatch && ownerDelayedMatch[1]) {
    const ownerName = cleanExtractedName(ownerDelayedMatch[1]);
    return {
      route: "OWNER_DELAYED_PROJECTS",
      params: { ownerName },
      normalizedKey: normalizeKey(ownerName),
      originalQuery: trimmedMessage,
    };
  }
  
  // Try portfolio analysis patterns (these go to LLM with enriched context)
  if (PATTERNS.PORTFOLIO_RISKY.test(trimmedMessage)) {
    return {
      route: "PORTFOLIO_RISKY",
      params: {},
      normalizedKey: "",
      originalQuery: trimmedMessage,
    };
  }
  
  if (PATTERNS.PORTFOLIO_QUICK_WINS.test(trimmedMessage)) {
    return {
      route: "PORTFOLIO_QUICK_WINS",
      params: {},
      normalizedKey: "",
      originalQuery: trimmedMessage,
    };
  }
  
  if (PATTERNS.PORTFOLIO_ANALYSIS.test(trimmedMessage)) {
    return {
      route: "PORTFOLIO_ANALYSIS",
      params: {},
      normalizedKey: "",
      originalQuery: trimmedMessage,
    };
  }
  
  // Try TOTAL_COUNT first (no parameters)
  if (PATTERNS.TOTAL_COUNT.test(trimmedMessage)) {
    return {
      route: "TOTAL_COUNT",
      params: {},
      normalizedKey: "",
      originalQuery: trimmedMessage,
    };
  }
  
  // Try COUNT_BY_DEPARTMENT
  const countDeptMatch = trimmedMessage.match(PATTERNS.COUNT_BY_DEPARTMENT);
  if (countDeptMatch && countDeptMatch[1]) {
    const deptName = cleanExtractedName(countDeptMatch[1]);
    return {
      route: "COUNT_BY_DEPARTMENT",
      params: { departmentName: deptName },
      normalizedKey: normalizeKey(deptName),
      originalQuery: trimmedMessage,
    };
  }
  
  // Try LIST_BY_DEPARTMENT
  const listDeptMatch = trimmedMessage.match(PATTERNS.LIST_BY_DEPARTMENT);
  if (listDeptMatch && listDeptMatch[1]) {
    const deptName = cleanExtractedName(listDeptMatch[1]);
    return {
      route: "LIST_BY_DEPARTMENT",
      params: { departmentName: deptName },
      normalizedKey: normalizeKey(deptName),
      originalQuery: trimmedMessage,
    };
  }
  
  // Try COUNT_BY_OWNER
  const countOwnerMatch = trimmedMessage.match(PATTERNS.COUNT_BY_OWNER);
  if (countOwnerMatch && countOwnerMatch[1]) {
    const ownerName = cleanExtractedName(countOwnerMatch[1]);
    return {
      route: "COUNT_BY_OWNER",
      params: { ownerName },
      normalizedKey: normalizeKey(ownerName),
      originalQuery: trimmedMessage,
    };
  }
  
  // Try LIST_BY_OWNER
  const listOwnerMatch = trimmedMessage.match(PATTERNS.LIST_BY_OWNER);
  if (listOwnerMatch && listOwnerMatch[1]) {
    const ownerName = cleanExtractedName(listOwnerMatch[1]);
    return {
      route: "LIST_BY_OWNER",
      params: { ownerName },
      normalizedKey: normalizeKey(ownerName),
      originalQuery: trimmedMessage,
    };
  }
  
  // Default to LLM fallback for complex queries
  return {
    route: "FALLBACK_LLM",
    params: {},
    normalizedKey: "",
    originalQuery: trimmedMessage,
  };
}

/**
 * Check if a route is deterministic (DB-only, no LLM needed)
 * Portfolio routes (PORTFOLIO_RISKY, PORTFOLIO_QUICK_WINS, PORTFOLIO_ANALYSIS)
 * use LLM with enriched context, so they are NOT deterministic
 */
export function isDeterministicRoute(route: QueryRoute): boolean {
  const llmRoutes: QueryRoute[] = [
    "FALLBACK_LLM",
    "PORTFOLIO_RISKY",
    "PORTFOLIO_QUICK_WINS", 
    "PORTFOLIO_ANALYSIS",
  ];
  return !llmRoutes.includes(route);
}
