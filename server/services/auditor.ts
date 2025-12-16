import type { Project } from "@shared/schema";
import { db } from "../db";
import { projects } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface AuditResult {
  score: number;
  flags: string[];
}

/**
 * ============================================================================
 * PMO ADAPTIVE DATA QUALITY AUDITOR v2.0
 * ============================================================================
 * 
 * Implements "Adaptive Logic" with two core systems:
 * 
 * 1. RELEVANCE FILTER (The Amnesty Rule)
 *    - Ignores historically empty fields to prevent Alert Fatigue
 *    - Strictly requires critical fields for matrix calculations
 * 
 * 2. SEMANTIC CONSISTENCY CHECKS (The BS Detector)
 *    - Detects logical incongruences and nonsense inputs
 *    - Flags time paradoxes, hidden costs, and vague promises
 * 
 * SCORING:
 *    - Missing Ignore List field  = -0 points (no penalty)
 *    - Missing Strict List field  = -20 points
 *    - Logical Incongruence       = -30 points
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION: FIELD RELEVANCE LISTS
// ============================================================================

/**
 * IGNORE LIST: Fields with historically low density (>70% empty)
 * These fields are NOT flagged when empty to prevent Alert Fatigue.
 */
/**
 * IGNORE LIST: Fields with historically low density (>70% empty)
 * These fields are NOT flagged when empty to prevent Alert Fatigue.
 */
const IGNORE_LIST = new Set([
  "legacy_id_powersteering",  // 90% empty historically
  "legacy_id_devops",         // Legacy system reference
  "legacy_id",                // Legacy ID field
  "soft_savings",             // Rarely tracked
  "monthly_breakdowns",       // Optional detail
  "scope_out",                // Often left empty intentionally
  "objective",                // Frequently redundant with description
]);

/**
 * STRICT LIST: Fields that are CRITICAL for PMO operations
 * Missing these fields incurs a HIGH penalty (-20 points each)
 */
const STRICT_FIELDS: Array<{
  field: keyof Project | string;
  label: string;
  check: (project: Project) => boolean;
}> = [
    {
      field: "projectName",
      label: "Sin nombre de proyecto",
      check: (p) => !p.projectName || p.projectName.trim().length < 3,
    },
    {
      field: "description",
      label: "Sin descripción",
      check: (p) => !p.description || p.description.trim().length < 10,
    },
    {
      field: "capexTier",
      label: "Sin clasificación CAPEX (Inversión)",
      check: (p) => !p.capexTier,
    },
  ];

// ============================================================================
// CONFIGURATION: SEMANTIC CONSISTENCY RULES
// ============================================================================

/**
 * Keywords that suggest hidden costs (for Free Lunch detection)
 */
const COST_KEYWORDS = [
  "compra", "comprar",
  "licencia", "licencias",
  "hardware",
  "adquisición", "adquisicion",
  "servidor", "servidores",
  "equipo", "equipos",
  "infraestructura",
  "software",
  "suscripción", "suscripcion",
  "contratación", "contratacion",
  "inversión", "inversion",
  "migración", "migracion",
  "implementación", "implementacion",
];

/**
 * Semantic Consistency Checks - detect logical nonsense
 */
interface SemanticCheck {
  name: string;
  flag: string;
  check: (project: Project) => boolean;
}

const SEMANTIC_CHECKS: SemanticCheck[] = [
  {
    name: "TIME_PARADOX",
    flag: "Fecha de término anterior al inicio",
    check: (project) => {
      const startDate = project.startDate ? new Date(project.startDate) : null;
      const endDate = project.endDate || project.endDateEstimated;
      const parsedEnd = endDate ? new Date(endDate) : null;

      if (startDate && parsedEnd && !isNaN(startDate.getTime()) && !isNaN(parsedEnd.getTime())) {
        return startDate > parsedEnd;
      }
      return false;
    },
  },
  {
    name: "FREE_LUNCH_FALLACY",
    flag: "Posible costo oculto detectado en descripción",
    check: (project) => {
      const capexTier = project.capexTier;
      if (capexTier !== "ZERO_COST") return false;

      const description = (project.description || "").toLowerCase();
      const projectName = (project.projectName || "").toLowerCase();
      const combined = `${description} ${projectName}`;

      return COST_KEYWORDS.some(keyword => combined.includes(keyword));
    },
  },
  {
    name: "VAGUE_PROMISE",
    flag: "Beneficio alto sin sustento detallado",
    check: (project) => {
      const financialImpact = project.financialImpact;
      if (financialImpact !== "HIGH_REVENUE") return false;

      const description = (project.description || "").trim();
      return description.length < 20;
    },
  },
  {
    name: "PHANTOM_LEADER",
    flag: "Proyecto sin responsable asignado",
    check: (project) => {
      const responsible = (project.responsible || "").trim().toLowerCase();
      const leader = (project.leader || "").trim().toLowerCase();
      const tbd = ["tbd", "por definir", "pendiente", "n/a", ""];

      return tbd.includes(responsible) && tbd.includes(leader);
    },
  },
  {
    name: "ZOMBIE_PROJECT",
    flag: "Proyecto activo sin avance reciente",
    check: (project) => {
      const status = (project.status || "").toLowerCase();
      const isActive = status.includes("progreso") || status.includes("abierto");

      if (!isActive) return false;

      const percent = project.percentComplete || 0;
      const endDate = project.endDateEstimated ? new Date(project.endDateEstimated) : null;
      const now = new Date();

      if (endDate && !isNaN(endDate.getTime())) {
        const isPastDue = endDate < now;
        if (isPastDue && percent < 90) {
          return true;
        }
      }

      return false;
    },
  },
];

// ============================================================================
// SCORING CONSTANTS
// ============================================================================

const PENALTY_STRICT_FIELD = 20;    // -20 points per missing strict field
const PENALTY_SEMANTIC = 30;        // -30 points per logical incongruence
const PENALTY_IGNORE_FIELD = 0;     // -0 points for ignored fields (amnesty)

// ============================================================================
// MAIN AUDIT FUNCTION
// ============================================================================

/**
 * Calculates a health score (0-100) for a project using adaptive logic.
 */
export function calculateProjectHealth(project: Project): AuditResult {
  let score = 100;
  const flags: string[] = [];

  // -------------------------------------------------------------------------
  // PHASE 1: STRICT FIELD CHECKS (-20 points each)
  // -------------------------------------------------------------------------
  for (const strictField of STRICT_FIELDS) {
    if (strictField.check(project)) {
      score -= PENALTY_STRICT_FIELD;
      flags.push(strictField.label);
    }
  }

  // -------------------------------------------------------------------------
  // PHASE 2: SEMANTIC CONSISTENCY CHECKS (-30 points each)
  // -------------------------------------------------------------------------
  for (const semantic of SEMANTIC_CHECKS) {
    if (semantic.check(project)) {
      score -= PENALTY_SEMANTIC;
      flags.push(semantic.flag);
    }
  }

  // -------------------------------------------------------------------------
  // PHASE 3: LEGACY RULES (maintained for backwards compatibility)
  // -------------------------------------------------------------------------

  // The Blank Check: scope_in is empty (scope_out is now in IGNORE_LIST)
  const scopeIn = (project.scopeIn || "").trim();
  if (!scopeIn) {
    score -= 10;
    flags.push("Alcance (In) indefinido");
  }

  // The Orphan: No analyst assigned
  const bpAnalyst = (project.bpAnalyst || "").trim().toLowerCase();
  const tbdValues = ["tbd", "por definir", "pendiente", "n/a", ""];
  if (tbdValues.includes(bpAnalyst)) {
    score -= 10;
    flags.push("Sin Analista BP asignado");
  }

  // -------------------------------------------------------------------------
  // FINAL: Clamp score between 0 and 100
  // -------------------------------------------------------------------------
  score = Math.max(0, Math.min(100, score));

  return { score, flags };
}

// Alias for backwards compatibility
export const auditProject = calculateProjectHealth;

// ============================================================================
// BATCH AUDIT FUNCTIONS
// ============================================================================

export async function auditAllProjects(): Promise<{
  audited: number;
  healthy: number;
  warning: number;
  critical: number;
  totalFlags: number;
  flagBreakdown: Record<string, number>;
}> {
  const allProjects = await db.select().from(projects).where(eq(projects.isActive, true));

  let healthy = 0;
  let warning = 0;
  let critical = 0;
  let totalFlags = 0;
  const flagBreakdown: Record<string, number> = {};

  for (const project of allProjects) {
    const { score, flags } = calculateProjectHealth(project);

    await db
      .update(projects)
      .set({
        healthScore: score,
        auditFlags: flags,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, project.id));

    totalFlags += flags.length;

    for (const flag of flags) {
      flagBreakdown[flag] = (flagBreakdown[flag] || 0) + 1;
    }

    if (score >= 80) {
      healthy++;
    } else if (score >= 50) {
      warning++;
    } else {
      critical++;
    }
  }

  console.log("[AUDITOR] Audit complete:");
  console.log(`  - Audited: ${allProjects.length} projects`);
  console.log(`  - Healthy (≥80): ${healthy}`);
  console.log(`  - Warning (50-79): ${warning}`);
  console.log(`  - Critical (<50): ${critical}`);
  console.log(`  - Total Flags: ${totalFlags}`);
  console.log("[AUDITOR] Flag Breakdown:");
  for (const [flag, count] of Object.entries(flagBreakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`  - "${flag}": ${count}`);
  }

  return {
    audited: allProjects.length,
    healthy,
    warning,
    critical,
    totalFlags,
    flagBreakdown,
  };
}

export async function auditSingleProject(projectId: number): Promise<AuditResult | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));

  if (!project) {
    return null;
  }

  const { score, flags } = calculateProjectHealth(project);

  await db
    .update(projects)
    .set({
      healthScore: score,
      auditFlags: flags,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  return { score, flags };
}

// ============================================================================
// UTILITY: Get audit statistics without updating DB
// ============================================================================

export function getAuditPreview(project: Project): AuditResult {
  return calculateProjectHealth(project);
}

export function getIgnoredFields(): string[] {
  return Array.from(IGNORE_LIST);
}

export function getStrictFields(): string[] {
  return STRICT_FIELDS.map(f => f.field as string);
}
