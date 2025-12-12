// Using javascript_database blueprint - PostgreSQL database integration
import { 
  excelVersions, projects, departments, milestones, projectUpdates, 
  changeLogs, kpiValues, chatMessages, filterPresets, users,
  type ExcelVersion, type InsertExcelVersion,
  type Project, type InsertProject,
  type Department, type InsertDepartment,
  type Milestone, type InsertMilestone,
  type ProjectUpdate, type InsertProjectUpdate,
  type ChangeLog, type InsertChangeLog,
  type KpiValue, type InsertKpiValue,
  type ChatMessage, type InsertChatMessage,
  type FilterPreset, type InsertFilterPreset,
  type User, type UpsertUser,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, inArray, count } from "drizzle-orm";

export interface IStorage {
  // User operations - email/password auth
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUserWithPassword(email: string, passwordHash: string, role?: string, firstName?: string, lastName?: string): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUserCount(): Promise<number>;
  updateUserRole(id: string, role: string): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
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
  getLatestUpdateDatesByProjectIds(projectIds: number[]): Promise<Map<number, Date>>;
  
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

  // Filter Presets
  getFilterPresets(): Promise<FilterPreset[]>;
  createFilterPreset(preset: InsertFilterPreset): Promise<FilterPreset>;
  deleteFilterPreset(id: number): Promise<void>;

  // Bulk Operations
  bulkUpdateProjects(ids: number[], field: string, value: string): Promise<number>;
  bulkDeleteProjects(ids: number[]): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // User operations - email/password auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUserWithPassword(
    email: string, 
    passwordHash: string, 
    role: string = "viewer",
    firstName?: string,
    lastName?: string
  ): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, role, firstName, lastName })
      .returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUserCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(users);
    return result?.count || 0;
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

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
    // Deactivate ALL projects that are NOT in the activeIds list
    // This ensures only projects from the current upload remain active
    if (activeIds.length === 0) {
      // Deactivate all active projects (no projects in new version)
      const result = await db.update(projects)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(projects.isActive, true));
      return 0;
    }
    
    // Deactivate projects not in the current version's active list
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

  async getLatestUpdateDatesByProjectIds(projectIds: number[]): Promise<Map<number, Date>> {
    if (projectIds.length === 0) return new Map();
    
    const result = new Map<number, Date>();
    
    const updates = await db.select({
      projectId: projectUpdates.projectId,
      updateDate: projectUpdates.updateDate,
    })
      .from(projectUpdates)
      .where(inArray(projectUpdates.projectId, projectIds))
      .orderBy(desc(projectUpdates.updateDate));
    
    for (const update of updates) {
      if (!result.has(update.projectId)) {
        result.set(update.projectId, update.updateDate);
      }
    }
    
    return result;
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

  // Filter Presets
  async getFilterPresets(): Promise<FilterPreset[]> {
    return db.select()
      .from(filterPresets)
      .orderBy(desc(filterPresets.createdAt));
  }

  async createFilterPreset(preset: InsertFilterPreset): Promise<FilterPreset> {
    const [result] = await db.insert(filterPresets).values(preset).returning();
    return result;
  }

  async deleteFilterPreset(id: number): Promise<void> {
    await db.delete(filterPresets).where(eq(filterPresets.id, id));
  }

  // Bulk Operations
  async bulkUpdateProjects(ids: number[], field: string, value: string): Promise<number> {
    if (ids.length === 0) return 0;

    const projectsToUpdate = await db.select()
      .from(projects)
      .where(inArray(projects.id, ids));

    if (projectsToUpdate.length === 0) return 0;

    const fieldMapping: Record<string, keyof typeof projects> = {
      status: 'status',
      priority: 'priority',
      responsible: 'responsible',
    };

    const dbField = fieldMapping[field];
    if (!dbField) {
      throw new Error(`Invalid field: ${field}`);
    }

    const changeLogsToCreate: InsertChangeLog[] = [];
    
    for (const project of projectsToUpdate) {
      const oldValue = project[field as keyof typeof project];
      
      changeLogsToCreate.push({
        projectId: project.id,
        versionId: project.sourceVersionId || 1,
        previousVersionId: null,
        changeType: "modified",
        fieldName: field,
        oldValue: oldValue !== null && oldValue !== undefined ? String(oldValue) : null,
        newValue: value,
        legacyId: project.legacyId,
        projectName: project.projectName,
      });
    }

    await db.update(projects)
      .set({ [dbField]: value, updatedAt: new Date() })
      .where(inArray(projects.id, ids));

    if (changeLogsToCreate.length > 0) {
      await db.insert(changeLogs).values(changeLogsToCreate);
    }

    return projectsToUpdate.length;
  }

  async bulkDeleteProjects(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;

    const projectsToDelete = await db.select()
      .from(projects)
      .where(inArray(projects.id, ids));

    if (projectsToDelete.length === 0) return 0;

    const changeLogsToCreate: InsertChangeLog[] = [];

    for (const project of projectsToDelete) {
      changeLogsToCreate.push({
        projectId: project.id,
        versionId: project.sourceVersionId || 1,
        previousVersionId: null,
        changeType: "deleted",
        fieldName: null,
        oldValue: project.projectName,
        newValue: null,
        legacyId: project.legacyId,
        projectName: project.projectName,
      });
    }

    await db.update(projects)
      .set({ isActive: false, updatedAt: new Date() })
      .where(inArray(projects.id, ids));

    if (changeLogsToCreate.length > 0) {
      await db.insert(changeLogs).values(changeLogsToCreate);
    }

    return projectsToDelete.length;
  }
}

export const storage = new DatabaseStorage();
