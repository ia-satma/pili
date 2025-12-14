/**
 * Single Source of Truth for Portfolio View
 * Used by Dashboard and PMO Bot to ensure consistent data
 */

import { storage } from "../storage";
import type { Project, Initiative, InitiativeSnapshot } from "../../shared/schema";
import { mapToCanonicalStatus, type CanonicalStatus } from "../../shared/statusMapping";

export interface PortfolioItem {
  id: number;
  title: string;
  status: string | null;
  canonicalStatus: CanonicalStatus;
  departmentName: string | null;
  responsible: string | null;
  sponsor: string | null;
  percentComplete: number | null;
  startDate: string | null;
  endDateEstimated: string | null;
  endDateEstimatedTbd: boolean | null;
  priority: string | null;
  description: string | null;
  parsedStatus: string | null;
  parsedNextSteps: string | null;
  estatusAlDia: string | null;
  totalValor: number | null;
  totalEsfuerzo: number | null;
  puntajeTotal: number | null;
  ranking: number | null;
  extraFields: Record<string, unknown> | null;
  source: 'project' | 'initiative';
  sourceId: number;
}

export interface PortfolioView {
  items: PortfolioItem[];
  source: 'projects' | 'initiatives' | 'mixed';
  totalCount: number;
  byCanonicalStatus: Record<CanonicalStatus, number>;
}

/**
 * Get current portfolio view - unified data source for Dashboard and PMO Bot
 * Prioritizes initiatives with latest snapshots, falls back to projects table
 */
export async function getCurrentPortfolioView(): Promise<PortfolioView> {
  const initiatives = await storage.getInitiatives();
  
  if (initiatives.length > 0) {
    const items = await buildFromInitiatives(initiatives);
    return buildPortfolioView(items, 'initiatives');
  }
  
  const projects = await storage.getProjects();
  const items = buildFromProjects(projects);
  return buildPortfolioView(items, 'projects');
}

async function buildFromInitiatives(initList: Initiative[]): Promise<PortfolioItem[]> {
  // Get all latest snapshots and create a map by initiative ID
  const latestSnapshots = await storage.getLatestSnapshotPerInitiative();
  const snapshotMap = new Map<number, InitiativeSnapshot>();
  for (const snap of latestSnapshots) {
    snapshotMap.set(snap.initiativeId, snap);
  }
  
  return initList.map(init => {
    const latestSnapshot = snapshotMap.get(init.id);
    const rawRow = latestSnapshot?.rawExcelRow || {};
    
    return {
      id: init.id,
      title: latestSnapshot?.title || init.title,
      status: latestSnapshot?.status || null,
      canonicalStatus: mapToCanonicalStatus(latestSnapshot?.status || null),
      departmentName: latestSnapshot?.departmentName || null,
      responsible: latestSnapshot?.owner || init.owner || null,
      sponsor: latestSnapshot?.sponsor || null,
      percentComplete: latestSnapshot?.percentComplete ?? null,
      startDate: latestSnapshot?.startDate || null,
      endDateEstimated: latestSnapshot?.endDateEstimated || null,
      endDateEstimatedTbd: (rawRow['endDateEstimatedTbd'] as boolean) ?? null,
      priority: latestSnapshot?.priority || null,
      description: latestSnapshot?.description || null,
      parsedStatus: (rawRow['parsedStatus'] as string) || null,
      parsedNextSteps: (rawRow['parsedNextSteps'] as string) || null,
      estatusAlDia: latestSnapshot?.estatusAlDia || null,
      totalValor: latestSnapshot?.totalValor ?? null,
      totalEsfuerzo: latestSnapshot?.totalEsfuerzo ?? null,
      puntajeTotal: latestSnapshot?.puntajeTotal ?? null,
      ranking: latestSnapshot?.ranking ?? null,
      extraFields: rawRow,
      source: 'initiative' as const,
      sourceId: init.id,
    };
  });
}

function buildFromProjects(projectList: Project[]): PortfolioItem[] {
  return projectList.map(p => ({
    id: p.id,
    title: p.projectName,
    status: p.status,
    canonicalStatus: mapToCanonicalStatus(p.status),
    departmentName: p.departmentName,
    responsible: p.responsible,
    sponsor: p.sponsor,
    percentComplete: p.percentComplete,
    startDate: p.startDate,
    endDateEstimated: p.endDateEstimated,
    endDateEstimatedTbd: p.endDateEstimatedTbd,
    priority: p.priority,
    description: p.description,
    parsedStatus: p.parsedStatus,
    parsedNextSteps: p.parsedNextSteps,
    estatusAlDia: p.estatusAlDia,
    totalValor: p.totalValor,
    totalEsfuerzo: p.totalEsfuerzo,
    puntajeTotal: p.puntajeTotal,
    ranking: p.ranking,
    extraFields: (p.extraFields as Record<string, unknown>) || null,
    source: 'project' as const,
    sourceId: p.id,
  }));
}

function buildPortfolioView(items: PortfolioItem[], source: 'projects' | 'initiatives'): PortfolioView {
  const byCanonicalStatus: Record<CanonicalStatus, number> = {
    OPEN: 0,
    IN_PROGRESS: 0,
    CLOSED: 0,
    ON_HOLD: 0,
    CANCELLED: 0,
    UNKNOWN: 0,
  };
  
  for (const item of items) {
    byCanonicalStatus[item.canonicalStatus]++;
  }
  
  return {
    items,
    source,
    totalCount: items.length,
    byCanonicalStatus,
  };
}
