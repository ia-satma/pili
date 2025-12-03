// Using javascript_database blueprint - PostgreSQL database integration
import { 
  excelVersions, projects, departments, milestones, projectUpdates, 
  changeLogs, kpiValues, chatMessages,
  type ExcelVersion, type InsertExcelVersion,
  type Project, type InsertProject,
  type Department, type InsertDepartment,
  type Milestone, type InsertMilestone,
  type ProjectUpdate, type InsertProjectUpdate,
  type ChangeLog, type InsertChangeLog,
  type KpiValue, type InsertKpiValue,
  type ChatMessage, type InsertChatMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Excel Versions
  createExcelVersion(version: InsertExcelVersion): Promise<ExcelVersion>;
  getExcelVersions(): Promise<ExcelVersion[]>;
  getExcelVersion(id: number): Promise<ExcelVersion | undefined>;
  updateExcelVersionStatus(id: number, status: string, processedRows: number, errors: string[]): Promise<void>;
  getLatestExcelVersion(): Promise<ExcelVersion | undefined>;
  
  // Departments
  createDepartment(dept: InsertDepartment): Promise<Department>;
  getDepartments(): Promise<Department[]>;
  getDepartmentByName(name: string): Promise<Department | undefined>;
  
  // Projects
  createProject(project: InsertProject): Promise<Project>;
  createProjects(projects: InsertProject[]): Promise<Project[]>;
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  getProjectByLegacyId(legacyId: string): Promise<Project | undefined>;
  updateProject(id: number, project: Partial<InsertProject>): Promise<Project>;
  deactivateProjectsNotInVersion(versionId: number, activeIds: number[]): Promise<number>;
  
  // Milestones
  createMilestone(milestone: InsertMilestone): Promise<Milestone>;
  getMilestonesByProjectId(projectId: number): Promise<Milestone[]>;
  
  // Project Updates
  createProjectUpdate(update: InsertProjectUpdate): Promise<ProjectUpdate>;
  getProjectUpdatesByProjectId(projectId: number): Promise<ProjectUpdate[]>;
  
  // Change Logs
  createChangeLog(log: InsertChangeLog): Promise<ChangeLog>;
  createChangeLogs(logs: InsertChangeLog[]): Promise<ChangeLog[]>;
  getChangeLogsByVersionId(versionId: number): Promise<ChangeLog[]>;
  getChangeLogsByProjectId(projectId: number): Promise<ChangeLog[]>;
  getChangeLogsBetweenVersions(fromVersionId: number, toVersionId: number): Promise<ChangeLog[]>;
  
  // KPI Values
  createKpiValue(kpi: InsertKpiValue): Promise<KpiValue>;
  createKpiValues(kpis: InsertKpiValue[]): Promise<KpiValue[]>;
  getKpiValuesByVersionId(versionId: number): Promise<KpiValue[]>;
  getLatestKpiValues(): Promise<KpiValue[]>;
  
  // Chat Messages
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(): Promise<ChatMessage[]>;
  clearChatMessages(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Excel Versions
  async createExcelVersion(version: InsertExcelVersion): Promise<ExcelVersion> {
    const [result] = await db.insert(excelVersions).values(version).returning();
    return result;
  }

  async getExcelVersions(): Promise<ExcelVersion[]> {
    return db.select().from(excelVersions).orderBy(desc(excelVersions.uploadedAt));
  }

  async getExcelVersion(id: number): Promise<ExcelVersion | undefined> {
    const [result] = await db.select().from(excelVersions).where(eq(excelVersions.id, id));
    return result;
  }

  async updateExcelVersionStatus(id: number, status: string, processedRows: number, errors: string[]): Promise<void> {
    await db.update(excelVersions)
      .set({ status, processedRows, validationErrors: errors })
      .where(eq(excelVersions.id, id));
  }

  async getLatestExcelVersion(): Promise<ExcelVersion | undefined> {
    const [result] = await db.select()
      .from(excelVersions)
      .where(eq(excelVersions.status, "completed"))
      .orderBy(desc(excelVersions.uploadedAt))
      .limit(1);
    return result;
  }

  // Departments
  async createDepartment(dept: InsertDepartment): Promise<Department> {
    const [result] = await db.insert(departments).values(dept).returning();
    return result;
  }

  async getDepartments(): Promise<Department[]> {
    return db.select().from(departments).orderBy(departments.name);
  }

  async getDepartmentByName(name: string): Promise<Department | undefined> {
    const [result] = await db.select().from(departments).where(eq(departments.name, name));
    return result;
  }

  // Projects
  async createProject(project: InsertProject): Promise<Project> {
    const [result] = await db.insert(projects).values(project).returning();
    return result;
  }

  async createProjects(projectList: InsertProject[]): Promise<Project[]> {
    if (projectList.length === 0) return [];
    return db.insert(projects).values(projectList).returning();
  }

  async getProjects(): Promise<Project[]> {
    return db.select()
      .from(projects)
      .where(eq(projects.isActive, true))
      .orderBy(desc(projects.updatedAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [result] = await db.select().from(projects).where(eq(projects.id, id));
    return result;
  }

  async getProjectByLegacyId(legacyId: string): Promise<Project | undefined> {
    const [result] = await db.select()
      .from(projects)
      .where(and(eq(projects.legacyId, legacyId), eq(projects.isActive, true)));
    return result;
  }

  async updateProject(id: number, project: Partial<InsertProject>): Promise<Project> {
    const [result] = await db.update(projects)
      .set({ ...project, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return result;
  }

  async deactivateProjectsNotInVersion(versionId: number, activeIds: number[]): Promise<number> {
    if (activeIds.length === 0) {
      // Deactivate all projects from this version
      const result = await db.update(projects)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(projects.sourceVersionId, versionId));
      return 0;
    }
    
    const result = await db.update(projects)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(projects.isActive, true),
          sql`${projects.id} NOT IN (${sql.join(activeIds.map(id => sql`${id}`), sql`, `)})`
        )
      );
    return 0;
  }

  // Milestones
  async createMilestone(milestone: InsertMilestone): Promise<Milestone> {
    const [result] = await db.insert(milestones).values(milestone).returning();
    return result;
  }

  async getMilestonesByProjectId(projectId: number): Promise<Milestone[]> {
    return db.select()
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(milestones.dueDate);
  }

  // Project Updates
  async createProjectUpdate(update: InsertProjectUpdate): Promise<ProjectUpdate> {
    const [result] = await db.insert(projectUpdates).values(update).returning();
    return result;
  }

  async getProjectUpdatesByProjectId(projectId: number): Promise<ProjectUpdate[]> {
    return db.select()
      .from(projectUpdates)
      .where(eq(projectUpdates.projectId, projectId))
      .orderBy(desc(projectUpdates.updateDate));
  }

  // Change Logs
  async createChangeLog(log: InsertChangeLog): Promise<ChangeLog> {
    const [result] = await db.insert(changeLogs).values(log).returning();
    return result;
  }

  async createChangeLogs(logs: InsertChangeLog[]): Promise<ChangeLog[]> {
    if (logs.length === 0) return [];
    return db.insert(changeLogs).values(logs).returning();
  }

  async getChangeLogsByVersionId(versionId: number): Promise<ChangeLog[]> {
    return db.select()
      .from(changeLogs)
      .where(eq(changeLogs.versionId, versionId))
      .orderBy(desc(changeLogs.changedAt));
  }

  async getChangeLogsByProjectId(projectId: number): Promise<ChangeLog[]> {
    return db.select()
      .from(changeLogs)
      .where(eq(changeLogs.projectId, projectId))
      .orderBy(desc(changeLogs.changedAt));
  }

  async getChangeLogsBetweenVersions(fromVersionId: number, toVersionId: number): Promise<ChangeLog[]> {
    return db.select()
      .from(changeLogs)
      .where(
        and(
          eq(changeLogs.versionId, toVersionId),
          eq(changeLogs.previousVersionId, fromVersionId)
        )
      )
      .orderBy(desc(changeLogs.changedAt));
  }

  // KPI Values
  async createKpiValue(kpi: InsertKpiValue): Promise<KpiValue> {
    const [result] = await db.insert(kpiValues).values(kpi).returning();
    return result;
  }

  async createKpiValues(kpis: InsertKpiValue[]): Promise<KpiValue[]> {
    if (kpis.length === 0) return [];
    return db.insert(kpiValues).values(kpis).returning();
  }

  async getKpiValuesByVersionId(versionId: number): Promise<KpiValue[]> {
    return db.select()
      .from(kpiValues)
      .where(eq(kpiValues.versionId, versionId))
      .orderBy(kpiValues.kpiCategory, kpiValues.kpiName);
  }

  async getLatestKpiValues(): Promise<KpiValue[]> {
    const latestVersion = await this.getLatestExcelVersion();
    if (!latestVersion) return [];
    return this.getKpiValuesByVersionId(latestVersion.id);
  }

  // Chat Messages
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [result] = await db.insert(chatMessages).values(message).returning();
    return result;
  }

  async getChatMessages(): Promise<ChatMessage[]> {
    return db.select()
      .from(chatMessages)
      .orderBy(chatMessages.createdAt);
  }

  async clearChatMessages(): Promise<void> {
    await db.delete(chatMessages);
  }
}

export const storage = new DatabaseStorage();
