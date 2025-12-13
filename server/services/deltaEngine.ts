import { storage } from "../storage";
import type { InitiativeSnapshot, InsertDeltaEvent } from "@shared/schema";

type Severity = "INFO" | "WARN" | "RISK";

interface FieldConfig {
  path: string;
  category: string;
  getSeverity: (oldVal: string | null, newVal: string | null) => Severity;
}

const fieldConfigs: FieldConfig[] = [
  { path: "identity.title", category: "identity", getSeverity: () => "INFO" },
  { path: "identity.description", category: "identity", getSeverity: () => "INFO" },
  { path: "identity.owner", category: "identity", getSeverity: () => "WARN" },
  { path: "identity.sponsor", category: "identity", getSeverity: () => "WARN" },
  { path: "identity.departmentName", category: "identity", getSeverity: () => "INFO" },
  
  { path: "status.status", category: "status", getSeverity: () => "WARN" },
  { path: "status.estatusAlDia", category: "status", getSeverity: (oldVal, newVal) => {
    if (newVal?.toLowerCase().includes("riesgo") || newVal?.toLowerCase().includes("vencido")) {
      return "RISK";
    }
    return "WARN";
  }},
  { path: "status.priority", category: "status", getSeverity: () => "WARN" },
  { path: "status.category", category: "status", getSeverity: () => "INFO" },
  { path: "status.projectType", category: "status", getSeverity: () => "INFO" },
  
  { path: "dates.startDate", category: "dates", getSeverity: () => "WARN" },
  { path: "dates.endDateEstimated", category: "dates", getSeverity: () => "WARN" },
  { path: "dates.endDateActual", category: "dates", getSeverity: () => "INFO" },
  { path: "progress.percentComplete", category: "progress", getSeverity: (oldVal, newVal) => {
    const oldNum = parseInt(oldVal || "0", 10);
    const newNum = parseInt(newVal || "0", 10);
    if (newNum < oldNum) return "RISK";
    return "INFO";
  }},
  
  { path: "scores.totalValor", category: "scores", getSeverity: (oldVal, newVal) => {
    const oldNum = parseInt(oldVal || "0", 10);
    const newNum = parseInt(newVal || "0", 10);
    if (newNum < oldNum) return "RISK";
    return "WARN";
  }},
  { path: "scores.totalEsfuerzo", category: "scores", getSeverity: (oldVal, newVal) => {
    const oldNum = parseInt(oldVal || "0", 10);
    const newNum = parseInt(newVal || "0", 10);
    if (newNum < oldNum) return "RISK";
    return "WARN";
  }},
  { path: "scores.puntajeTotal", category: "scores", getSeverity: (oldVal, newVal) => {
    const oldNum = parseInt(oldVal || "0", 10);
    const newNum = parseInt(newVal || "0", 10);
    if (newNum < oldNum) return "RISK";
    return "WARN";
  }},
  { path: "scores.ranking", category: "scores", getSeverity: () => "INFO" },
];

function getSnapshotFieldValue(snapshot: InitiativeSnapshot, fieldPath: string): string | null {
  const fieldName = fieldPath.split(".")[1];
  const value = (snapshot as Record<string, unknown>)[fieldName];
  if (value === null || value === undefined) return null;
  return String(value);
}

function normalizeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value);
}

export async function generateDeltasForSnapshot(
  toSnapshot: InitiativeSnapshot
): Promise<{ created: number; deltas: InsertDeltaEvent[] }> {
  const deltas: InsertDeltaEvent[] = [];
  
  const recentSnapshots = await storage.getRecentSnapshots(toSnapshot.initiativeId, 2);
  
  if (recentSnapshots.length < 2) {
    return { created: 0, deltas: [] };
  }
  
  const fromSnapshot = recentSnapshots.find(s => s.id !== toSnapshot.id);
  if (!fromSnapshot) {
    return { created: 0, deltas: [] };
  }
  
  for (const config of fieldConfigs) {
    const oldValue = getSnapshotFieldValue(fromSnapshot, config.path);
    const newValue = getSnapshotFieldValue(toSnapshot, config.path);
    
    if (oldValue !== newValue) {
      const severity = config.getSeverity(oldValue, newValue);
      deltas.push({
        initiativeId: toSnapshot.initiativeId,
        fromSnapshotId: fromSnapshot.id,
        toSnapshotId: toSnapshot.id,
        fieldPath: config.path,
        oldValue: normalizeValue(oldValue),
        newValue: normalizeValue(newValue),
        severity,
      });
    }
  }
  
  for (const delta of deltas) {
    await storage.createDeltaEvent(delta);
  }
  
  return { created: deltas.length, deltas };
}

export async function generateDeltasForBatch(batchId: number): Promise<{ total: number }> {
  const snapshots = await storage.getSnapshotsByBatchId(batchId);
  let total = 0;
  
  for (const snapshot of snapshots) {
    const result = await generateDeltasForSnapshot(snapshot);
    total += result.created;
  }
  
  return { total };
}
