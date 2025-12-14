import { z } from "zod";
import { db } from "../db";
import { projects } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export interface ValidationResult {
  isClean: boolean;
  score: number;
  errors: Record<string, string>;
}

export interface AuditSummary {
  totalProjects: number;
  cleanProjects: number;
  dirtyProjects: number;
  averageScore: number;
  validatedAt: Date;
}

const dateOrStringSchema = z.union([
  z.string(),
  z.date(),
  z.null(),
  z.undefined(),
]).optional();

const perfectProjectSchema = z.object({
  projectName: z.string().min(3, "Nombre debe tener al menos 3 caracteres"),
  description: z.string().min(10, "Descripción muy corta").optional().nullable(),
  departmentName: z.string().min(1, "Departamento requerido").optional().nullable(),
  responsible: z.string().min(2, "Responsable requerido").optional().nullable(),
  status: z.enum(["Abierto", "Cerrado", "En Espera", "Cancelado", "Open", "Closed", "On Hold", "Cancelled"]).optional().nullable(),
  percentComplete: z.number().min(0).max(100).optional().nullable(),
  startDate: dateOrStringSchema,
  endDateEstimated: dateOrStringSchema,
});

const fieldWeights: Record<string, number> = {
  projectName: 20,
  description: 10,
  departmentName: 15,
  responsible: 15,
  status: 10,
  percentComplete: 10,
  startDate: 10,
  endDateEstimated: 10,
};

export function validateProject(project: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};
  let earnedPoints = 0;
  const totalPoints = Object.values(fieldWeights).reduce((a, b) => a + b, 0);

  const result = perfectProjectSchema.safeParse(project);
  
  if (!result.success) {
    for (const issue of result.error.issues) {
      const fieldName = issue.path[0] as string;
      errors[fieldName] = issue.message;
    }
  }

  for (const [field, weight] of Object.entries(fieldWeights)) {
    const value = project[field];
    if (value !== null && value !== undefined && value !== "") {
      if (!errors[field]) {
        earnedPoints += weight;
      }
    } else {
      if (!errors[field]) {
        errors[field] = `Campo vacío o faltante`;
      }
    }
  }

  const score = Math.round((earnedPoints / totalPoints) * 100);
  const isClean = Object.keys(errors).length === 0;

  return { isClean, score, errors };
}

export async function validateAndUpdateProject(projectId: number): Promise<ValidationResult> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const result = validateProject(project as unknown as Record<string, unknown>);

  await db.update(projects)
    .set({
      dataHealthScore: result.score,
      validationErrors: result.errors,
      isClean: result.isClean,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  return result;
}

export async function runFullAudit(): Promise<AuditSummary> {
  const allProjects = await db.select().from(projects).where(eq(projects.isActive, true));
  
  let cleanCount = 0;
  let totalScore = 0;

  for (const project of allProjects) {
    const result = validateProject(project as unknown as Record<string, unknown>);
    
    await db.update(projects)
      .set({
        dataHealthScore: result.score,
        validationErrors: result.errors,
        isClean: result.isClean,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, project.id));

    if (result.isClean) cleanCount++;
    totalScore += result.score;
  }

  return {
    totalProjects: allProjects.length,
    cleanProjects: cleanCount,
    dirtyProjects: allProjects.length - cleanCount,
    averageScore: allProjects.length > 0 ? Math.round(totalScore / allProjects.length) : 0,
    validatedAt: new Date(),
  };
}

export async function getHealthStats(): Promise<{
  totalProjects: number;
  cleanProjects: number;
  dirtyProjects: number;
  averageScore: number;
}> {
  const [stats] = await db.select({
    total: sql<number>`count(*)`,
    clean: sql<number>`count(*) filter (where ${projects.isClean} = true)`,
    avgScore: sql<number>`coalesce(avg(${projects.dataHealthScore}), 0)`,
  }).from(projects).where(eq(projects.isActive, true));

  return {
    totalProjects: Number(stats.total),
    cleanProjects: Number(stats.clean),
    dirtyProjects: Number(stats.total) - Number(stats.clean),
    averageScore: Math.round(Number(stats.avgScore)),
  };
}

export async function getDirtyProjects(): Promise<typeof projects.$inferSelect[]> {
  return await db.select()
    .from(projects)
    .where(sql`${projects.isActive} = true AND ${projects.isClean} = false`)
    .orderBy(projects.dataHealthScore);
}
