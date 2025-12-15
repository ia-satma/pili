/**
 * Chaser Notification Scheduler
 * 
 * Detects stale projects (no updates in 7+ days) and generates
 * nudge notifications for project leaders.
 */

import { db } from "./db";
import { projects, chaserNotifications } from "@shared/schema";
import { sql, and, lt, eq, isNotNull } from "drizzle-orm";

const STALE_THRESHOLD_DAYS = 7;

interface StaleProject {
  id: number;
  projectName: string;
  responsible: string | null;
  updatedAt: Date;
  daysSinceUpdate: number;
}

/**
 * Query projects that haven't been updated in the last N days
 */
export async function getStaleProjects(thresholdDays: number = STALE_THRESHOLD_DAYS): Promise<StaleProject[]> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);

  const staleProjects = await db
    .select({
      id: projects.id,
      projectName: projects.projectName,
      responsible: projects.responsible,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(
      and(
        isNotNull(projects.updatedAt),
        lt(projects.updatedAt, thresholdDate),
        eq(projects.isActive, true),
        isNotNull(projects.responsible)
      )
    );

  return staleProjects
    .filter((p) => p.updatedAt !== null)
    .map((p) => ({
      ...p,
      daysSinceUpdate: Math.floor(
        (Date.now() - p.updatedAt!.getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));
}

/**
 * Generate a nudge notification message for a stale project
 */
export function generateNudgeMessage(projectName: string): string {
  return `Tu proyecto '${projectName}' no ha reportado avances esta semana. Actualiza el Grid.`;
}

/**
 * Create chaser notifications for all stale projects
 * Returns the number of notifications created
 */
export async function generateChaserNotifications(): Promise<{
  created: number;
  projects: Array<{ id: number; name: string; responsible: string | null }>;
}> {
  const staleProjects = await getStaleProjects();
  
  if (staleProjects.length === 0) {
    return { created: 0, projects: [] };
  }

  const notifications = staleProjects.map((project) => ({
    projectId: project.id,
    recipientName: project.responsible,
    recipientEmail: null,
    message: generateNudgeMessage(project.projectName),
    status: "pending" as const,
  }));

  await db.insert(chaserNotifications).values(notifications);

  return {
    created: notifications.length,
    projects: staleProjects.map((p) => ({
      id: p.id,
      name: p.projectName,
      responsible: p.responsible,
    })),
  };
}

/**
 * Get pending notifications that haven't been sent yet
 */
export async function getPendingNotifications() {
  return db
    .select()
    .from(chaserNotifications)
    .where(eq(chaserNotifications.status, "pending"));
}

/**
 * Mark a notification as sent
 */
export async function markNotificationSent(notificationId: number) {
  await db
    .update(chaserNotifications)
    .set({
      status: "sent",
      sentAt: new Date(),
    })
    .where(eq(chaserNotifications.id, notificationId));
}

/**
 * Get stale projects summary for dashboard/reports
 */
export async function getStaleProjectsSummary() {
  const staleProjects = await getStaleProjects();
  
  return {
    totalStale: staleProjects.length,
    projects: staleProjects.map((p) => ({
      id: p.id,
      projectName: p.projectName,
      responsible: p.responsible,
      daysSinceUpdate: p.daysSinceUpdate,
    })),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Run the scheduler - main entry point
 * Can be called manually or via cron job
 */
export async function runChaserScheduler(): Promise<{
  success: boolean;
  notificationsCreated: number;
  staleProjectCount: number;
  error?: string;
}> {
  try {
    const staleProjects = await getStaleProjects();
    const result = await generateChaserNotifications();
    
    console.log(`[Scheduler] Generated ${result.created} chaser notifications for ${staleProjects.length} stale projects`);
    
    return {
      success: true,
      notificationsCreated: result.created,
      staleProjectCount: staleProjects.length,
    };
  } catch (error) {
    console.error("[Scheduler] Error running chaser scheduler:", error);
    return {
      success: false,
      notificationsCreated: 0,
      staleProjectCount: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
