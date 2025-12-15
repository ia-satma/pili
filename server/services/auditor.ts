import type { Project } from "@shared/schema";
import { db } from "../db";
import { projects } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface AuditResult {
  score: number;
  flags: string[];
}

/**
 * PMO Data Quality Auditor
 * 
 * Calculates a health score (0-100) for projects based on "ruthless" rules:
 * - Rule 1 (Ghost Project): Budget > 0 but problem_statement < 10 chars → -40 points
 * - Rule 2 (Orphan): bp_analyst missing or "TBD" → -15 points
 * - Rule 3 (Blank Check): scope_in AND scope_out both empty → -25 points
 */
export function calculateProjectHealth(project: Project): AuditResult {
  let score = 100;
  const flags: string[] = [];

  // Rule 1: The Ghost Project
  // Budget assigned but no justification (problem_statement missing or < 10 chars)
  const budget = project.budget || 0;
  const problemStatement = project.problemStatement || "";
  if (budget > 0 && problemStatement.trim().length < 10) {
    score -= 40;
    flags.push("Presupuesto sin justificación");
  }

  // Rule 2: The Orphan
  // No analyst assigned or marked as TBD
  const bpAnalyst = (project.bpAnalyst || "").trim().toLowerCase();
  if (!bpAnalyst || bpAnalyst === "tbd" || bpAnalyst === "por definir") {
    score -= 15;
    flags.push("Sin Analista");
  }

  // Rule 3: The Blank Check
  // Both scope_in AND scope_out are empty
  const scopeIn = (project.scopeIn || "").trim();
  const scopeOut = (project.scopeOut || "").trim();
  if (!scopeIn && !scopeOut) {
    score -= 25;
    flags.push("Alcance indefinido");
  }

  // Clamp score between 0 and 100
  score = Math.max(0, Math.min(100, score));

  return { score, flags };
}

// Alias for backwards compatibility
export const auditProject = calculateProjectHealth;

export async function auditAllProjects(): Promise<{
  audited: number;
  healthy: number;
  warning: number;
  critical: number;
  totalFlags: number;
}> {
  const allProjects = await db.select().from(projects).where(eq(projects.isActive, true));

  let healthy = 0;
  let warning = 0;
  let critical = 0;
  let totalFlags = 0;

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

    if (score >= 80) {
      healthy++;
    } else if (score >= 50) {
      warning++;
    } else {
      critical++;
    }
  }

  return {
    audited: allProjects.length,
    healthy,
    warning,
    critical,
    totalFlags,
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
