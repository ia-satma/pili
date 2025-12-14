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
 */
export function isDeterministicRoute(route: QueryRoute): boolean {
  return route !== "FALLBACK_LLM";
}
