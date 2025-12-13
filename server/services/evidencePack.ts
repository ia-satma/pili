import { storage } from "../storage";
import type {
  Initiative,
  InitiativeSnapshot,
  DeltaEvent,
  GovernanceAlert,
  StatusUpdate,
} from "@shared/schema";

export interface EvidencePack {
  initiative: Initiative;
  latestSnapshot: InitiativeSnapshot | null;
  recentSnapshots: InitiativeSnapshot[]; // last 3
  recentDeltas: DeltaEvent[]; // last 20
  openAlerts: GovernanceAlert[];
  recentStatusUpdates: StatusUpdate[]; // last 5
  provenance: {
    batchIds: number[];
    snapshotIds: number[];
    alertIds: number[];
    deltaIds: number[];
  };
}

export async function buildEvidencePack(initiativeId: number): Promise<EvidencePack | null> {
  const initiative = await storage.getInitiative(initiativeId);
  if (!initiative) {
    return null;
  }

  const snapshots = await storage.getSnapshotsByInitiativeId(initiativeId);
  const recentSnapshots = snapshots.slice(0, 3);
  const latestSnapshot = recentSnapshots[0] || null;

  const recentDeltas = await storage.getDeltasByInitiativeId(initiativeId, 20);

  const allAlerts = await storage.getAlertsByInitiativeId(initiativeId);
  const openAlerts = allAlerts.filter((a) => a.status === "OPEN");

  const recentStatusUpdates = await storage.getRecentStatusUpdates(initiativeId, 5);

  const batchIds = Array.from(new Set(recentSnapshots.map((s) => s.batchId)));
  const snapshotIds = recentSnapshots.map((s) => s.id);
  const alertIds = openAlerts.map((a) => a.id);
  const deltaIds = recentDeltas.map((d) => d.id);

  return {
    initiative,
    latestSnapshot,
    recentSnapshots,
    recentDeltas,
    openAlerts,
    recentStatusUpdates,
    provenance: {
      batchIds,
      snapshotIds,
      alertIds,
      deltaIds,
    },
  };
}

export function formatEvidenceForPrompt(pack: EvidencePack): string {
  const lines: string[] = [];
  
  lines.push("# Evidencia de Iniciativa");
  lines.push("");
  lines.push(`## Identificación`);
  lines.push(`- ID: ${pack.initiative.id}`);
  lines.push(`- Título: ${pack.initiative.title}`);
  lines.push(`- Propietario: ${pack.initiative.owner || "N/A"}`);
  lines.push(`- DevOps Card ID: ${pack.initiative.devopsCardId || "N/A"}`);
  lines.push(`- PowerSteering ID: ${pack.initiative.powerSteeringId || "N/A"}`);
  lines.push(`- Estado Actual: ${pack.initiative.currentStatus || "N/A"}`);
  lines.push(`- Activa: ${pack.initiative.isActive ? "Sí" : "No"}`);
  lines.push("");
  
  if (pack.latestSnapshot) {
    const s = pack.latestSnapshot;
    lines.push("## Último Snapshot");
    lines.push(`- Fecha: ${s.createdAt}`);
    lines.push(`- Estatus: ${s.status || "N/A"}`);
    lines.push(`- Estatus al Día: ${s.estatusAlDia || "N/A"}`);
    lines.push(`- % Completado: ${s.percentComplete ?? "N/A"}%`);
    lines.push(`- Departamento: ${s.departmentName || "N/A"}`);
    lines.push(`- Sponsor: ${s.sponsor || "N/A"}`);
    lines.push(`- Categoría: ${s.category || "N/A"}`);
    lines.push(`- Tipo: ${s.projectType || "N/A"}`);
    lines.push(`- Fecha Inicio: ${s.startDate || "N/A"}`);
    lines.push(`- Fecha Fin Estimada: ${s.endDateEstimated || "N/A"}`);
    lines.push(`- Fecha Fin Real: ${s.endDateActual || "N/A"}`);
    lines.push("");
    lines.push("### Puntuación");
    lines.push(`- Total Valor: ${s.totalValor ?? "N/A"}`);
    lines.push(`- Total Esfuerzo: ${s.totalEsfuerzo ?? "N/A"}`);
    lines.push(`- Puntaje Total: ${s.puntajeTotal ?? "N/A"}`);
    lines.push(`- Ranking: ${s.ranking ?? "N/A"}`);
    lines.push("");
  } else {
    lines.push("## Último Snapshot");
    lines.push("No hay snapshots disponibles.");
    lines.push("");
  }
  
  if (pack.openAlerts.length > 0) {
    lines.push("## Alertas Abiertas");
    for (const alert of pack.openAlerts) {
      lines.push(`- [${alert.signalCode}] Severidad: ${alert.severity}`);
      lines.push(`  Razón: ${alert.rationale || "N/A"}`);
      lines.push(`  Detectada: ${alert.detectedAt}`);
    }
    lines.push("");
  } else {
    lines.push("## Alertas Abiertas");
    lines.push("No hay alertas abiertas.");
    lines.push("");
  }
  
  if (pack.recentDeltas.length > 0) {
    lines.push("## Cambios Recientes (Deltas)");
    for (const delta of pack.recentDeltas.slice(0, 10)) {
      lines.push(`- [${delta.severity}] ${delta.fieldPath}: ${delta.oldValue || "(vacío)"} → ${delta.newValue || "(vacío)"}`);
    }
    if (pack.recentDeltas.length > 10) {
      lines.push(`  ... y ${pack.recentDeltas.length - 10} cambios más`);
    }
    lines.push("");
  }
  
  if (pack.recentStatusUpdates.length > 0) {
    lines.push("## Actualizaciones de Estado Recientes");
    for (const update of pack.recentStatusUpdates) {
      lines.push(`- Fecha: ${update.createdAt}`);
      if (update.statusText) lines.push(`  S: ${update.statusText}`);
      if (update.nextStepsText) lines.push(`  N: ${update.nextStepsText}`);
    }
    lines.push("");
  }
  
  lines.push("## Procedencia");
  lines.push(`- Batch IDs: ${pack.provenance.batchIds.join(", ") || "N/A"}`);
  lines.push(`- Snapshot IDs: ${pack.provenance.snapshotIds.join(", ") || "N/A"}`);
  lines.push(`- Alert IDs: ${pack.provenance.alertIds.join(", ") || "N/A"}`);
  lines.push(`- Delta IDs: ${pack.provenance.deltaIds.join(", ") || "N/A"}`);
  
  return lines.join("\n");
}
