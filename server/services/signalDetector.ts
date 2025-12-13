import { storage } from "../storage";
import type { InsertGovernanceAlert, InitiativeSnapshot } from "@shared/schema";

type SignalCode = "ZOMBI" | "ANGUILA" | "OPTIMISTA" | "INDECISO" | "DRENAJE_DE_VALOR";
type Severity = "LOW" | "MEDIUM" | "HIGH";

interface Signal {
  code: SignalCode;
  severity: Severity;
  detect: (initiativeId: number, latestSnapshot: InitiativeSnapshot) => Promise<string | null>;
}

const ZOMBI_THRESHOLD_DAYS = 21;
const ANGUILA_DATE_SHIFT_DAYS = 15;
const OPTIMISTA_SCORE_INCREASE_PERCENT = 20;
const INDECISO_WEEKS = 4;

async function detectZombi(initiativeId: number): Promise<string | null> {
  const lastUpdate = await storage.getLastStatusUpdate(initiativeId);
  
  if (!lastUpdate) {
    return `Sin actualizaciones de estado registradas`;
  }
  
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(lastUpdate.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSinceUpdate > ZOMBI_THRESHOLD_DAYS) {
    return `Sin actualización de estado en ${daysSinceUpdate} días (umbral: ${ZOMBI_THRESHOLD_DAYS} días)`;
  }
  
  return null;
}

async function detectAnguila(initiativeId: number): Promise<string | null> {
  const snapshots = await storage.getRecentSnapshots(initiativeId, 3);
  
  if (snapshots.length < 3) return null;
  
  const dates = snapshots
    .map(s => s.endDateEstimated)
    .filter((d): d is string => d !== null);
  
  if (dates.length < 3) return null;
  
  let totalShift = 0;
  for (let i = 0; i < dates.length - 1; i++) {
    const currentDate = new Date(dates[i]);
    const prevDate = new Date(dates[i + 1]);
    const diffDays = Math.abs((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > ANGUILA_DATE_SHIFT_DAYS) {
      totalShift += diffDays;
    }
  }
  
  if (totalShift > 0) {
    return `Fecha estimada de fin movida significativamente en 3 snapshots consecutivos (${Math.round(totalShift)} días acumulados)`;
  }
  
  return null;
}

async function detectOptimista(initiativeId: number, latestSnapshot: InitiativeSnapshot): Promise<string | null> {
  const snapshots = await storage.getRecentSnapshots(initiativeId, 2);
  
  if (snapshots.length < 2) return null;
  
  const prevSnapshot = snapshots.find(s => s.id !== latestSnapshot.id);
  if (!prevSnapshot) return null;
  
  const prevScore = prevSnapshot.puntajeTotal || 0;
  const newScore = latestSnapshot.puntajeTotal || 0;
  
  if (prevScore === 0) return null;
  
  const increasePercent = ((newScore - prevScore) / prevScore) * 100;
  
  if (increasePercent > OPTIMISTA_SCORE_INCREASE_PERCENT) {
    return `Puntaje total aumentó ${increasePercent.toFixed(1)}% sin nuevas entradas de evaluación`;
  }
  
  return null;
}

async function detectIndeciso(initiativeId: number): Promise<string | null> {
  const deltas = await storage.getDeltasByInitiativeId(initiativeId, 100);
  
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - (INDECISO_WEEKS * 7));
  
  const recentDeltas = deltas.filter(d => new Date(d.detectedAt) >= fourWeeksAgo);
  
  const fieldChanges = new Map<string, Array<{ old: string | null; new: string | null }>>();
  
  for (const delta of recentDeltas) {
    const changes = fieldChanges.get(delta.fieldPath) || [];
    changes.push({ old: delta.oldValue, new: delta.newValue });
    fieldChanges.set(delta.fieldPath, changes);
  }
  
  for (const [fieldPath, changes] of fieldChanges) {
    if (changes.length >= 2) {
      for (let i = 0; i < changes.length - 1; i++) {
        const first = changes[i];
        const second = changes[i + 1];
        if (first.old === second.new && first.new === second.old) {
          return `Campo "${fieldPath}" cambió A→B→A en las últimas ${INDECISO_WEEKS} semanas`;
        }
      }
    }
  }
  
  return null;
}

async function detectDrenajeDeValor(initiativeId: number, latestSnapshot: InitiativeSnapshot): Promise<string | null> {
  const snapshots = await storage.getRecentSnapshots(initiativeId, 2);
  
  if (snapshots.length < 2) return null;
  
  const prevSnapshot = snapshots.find(s => s.id !== latestSnapshot.id);
  if (!prevSnapshot) return null;
  
  const prevValor = prevSnapshot.totalValor || 0;
  const newValor = latestSnapshot.totalValor || 0;
  
  if (newValor < prevValor) {
    return `Valor total disminuyó de ${prevValor} a ${newValor} en snapshots consecutivos`;
  }
  
  return null;
}

const signals: Signal[] = [
  { 
    code: "ZOMBI", 
    severity: "MEDIUM", 
    detect: async (id) => detectZombi(id) 
  },
  { 
    code: "ANGUILA", 
    severity: "HIGH", 
    detect: async (id) => detectAnguila(id) 
  },
  { 
    code: "OPTIMISTA", 
    severity: "MEDIUM", 
    detect: async (id, snap) => detectOptimista(id, snap) 
  },
  { 
    code: "INDECISO", 
    severity: "MEDIUM", 
    detect: async (id) => detectIndeciso(id) 
  },
  { 
    code: "DRENAJE_DE_VALOR", 
    severity: "HIGH", 
    detect: async (id, snap) => detectDrenajeDeValor(id, snap) 
  },
];

export async function runSignalDetection(
  initiativeId: number,
  latestSnapshot: InitiativeSnapshot
): Promise<{ alertsCreated: number }> {
  let alertsCreated = 0;
  
  for (const signal of signals) {
    const existingAlert = await storage.getOpenAlertBySignal(initiativeId, signal.code);
    
    const rationale = await signal.detect(initiativeId, latestSnapshot);
    
    if (rationale) {
      if (existingAlert) {
        await storage.updateGovernanceAlert(existingAlert.id, { rationale });
      } else {
        const alertData: InsertGovernanceAlert = {
          initiativeId,
          signalCode: signal.code,
          severity: signal.severity,
          status: "OPEN",
          rationale,
          relatedSnapshotId: latestSnapshot.id,
          relatedBatchId: latestSnapshot.batchId,
        };
        await storage.createGovernanceAlert(alertData);
        alertsCreated++;
      }
    }
  }
  
  return { alertsCreated };
}

export async function runSignalDetectionForBatch(batchId: number): Promise<{ totalAlerts: number }> {
  const snapshots = await storage.getSnapshotsByBatchId(batchId);
  let totalAlerts = 0;
  
  for (const snapshot of snapshots) {
    const result = await runSignalDetection(snapshot.initiativeId, snapshot);
    totalAlerts += result.alertsCreated;
  }
  
  return { totalAlerts };
}
