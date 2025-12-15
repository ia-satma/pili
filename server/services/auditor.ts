import type { Project } from "@shared/schema";
import { db } from "../db";
import { projects } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface AuditResult {
  score: number;
  flags: string[];
}

export interface AuditFlag {
  type: "FATAL" | "WARNING" | "INFO";
  message: string;
  scorePenalty: number;
}

const PMO_AUDIT_RULES: ((project: Project) => AuditFlag | null)[] = [
  (project) => {
    const budget = project.budget || 0;
    const problemStatement = project.problemStatement || project.description || "";
    if (budget > 0 && problemStatement.length < 20) {
      return {
        type: "FATAL",
        message: "Presupuesto asignado sin justificación clara.",
        scorePenalty: 40,
      };
    }
    return null;
  },

  (project) => {
    const scopeIn = project.scopeIn || project.scope || "";
    const scopeOut = project.scopeOut || "";
    if (!scopeIn.trim() || !scopeOut.trim()) {
      return {
        type: "WARNING",
        message: "Alcance no definido (Riesgo de Creep).",
        scorePenalty: 20,
      };
    }
    return null;
  },

  (project) => {
    const bpAnalyst = project.bpAnalyst || "";
    if (!bpAnalyst.trim()) {
      return {
        type: "INFO",
        message: "Sin analista asignado.",
        scorePenalty: 10,
      };
    }
    return null;
  },

  (project) => {
    const sponsor = project.sponsor || "";
    if (!sponsor.trim()) {
      return {
        type: "WARNING",
        message: "Sin sponsor asignado.",
        scorePenalty: 15,
      };
    }
    return null;
  },

  (project) => {
    const objective = project.objective || "";
    if (!objective.trim() || objective.length < 10) {
      return {
        type: "INFO",
        message: "Objetivo no definido o muy corto.",
        scorePenalty: 10,
      };
    }
    return null;
  },

  (project) => {
    const startDate = project.startDate;
    const endDate = project.endDate || project.endDateEstimated;
    if (!startDate || !endDate) {
      return {
        type: "INFO",
        message: "Fechas de inicio o fin no definidas.",
        scorePenalty: 5,
      };
    }
    return null;
  },
];

export function auditProject(project: Project): AuditResult {
  let score = 100;
  const flags: string[] = [];

  for (const rule of PMO_AUDIT_RULES) {
    const result = rule(project);
    if (result) {
      score -= result.scorePenalty;
      flags.push(`[${result.type}] ${result.message}`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  return { score, flags };
}

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
    const { score, flags } = auditProject(project);
    
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

  const { score, flags } = auditProject(project);

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
