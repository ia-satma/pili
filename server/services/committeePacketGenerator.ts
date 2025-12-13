import { storage } from "../storage";
import type { InsertCommitteePacket } from "@shared/schema";

type RecommendedAction = "APPROVE" | "DEFER" | "REQUEST_INFO";

interface InitiativeSummary {
  id: number;
  title: string;
  type: string | null;
  businessUnit: string | null;
  gate: string | null;
  scores: {
    value: number | null;
    effort: number | null;
    total: number | null;
  };
  recentDeltas: Array<{
    fieldPath: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
  openAlerts: Array<{
    signalCode: string;
    severity: string;
    rationale: string;
  }>;
  dataQualityScore: number | null;
  recommendedAction: RecommendedAction;
}

function determineRecommendedAction(
  alerts: Array<{ signalCode: string; severity: string }>
): RecommendedAction {
  const hasHighSeverity = alerts.some(a => a.severity === "HIGH");
  const hasZombiOrAnguila = alerts.some(a => 
    a.signalCode === "ZOMBI" || a.signalCode === "ANGUILA"
  );
  
  if (hasHighSeverity || hasZombiOrAnguila) {
    return "DEFER";
  }
  
  const hasMediumSeverity = alerts.some(a => a.severity === "MEDIUM");
  if (hasMediumSeverity || alerts.length > 0) {
    return "REQUEST_INFO";
  }
  
  return "APPROVE";
}

export async function generateCommitteePacket(
  jobId?: number
): Promise<{ packetId: number; initiativeCount: number }> {
  const packet = await storage.createCommitteePacket({
    jobId: jobId || null,
    status: "PENDING",
    summaryJson: null,
  });

  try {
    const snapshots = await storage.getLatestSnapshotPerInitiative();
    const initiativeSummaries: InitiativeSummary[] = [];

    for (const snapshot of snapshots) {
      const deltas = await storage.getDeltasByInitiativeId(snapshot.initiativeId, 5);
      const alerts = await storage.getAlertsByInitiativeId(snapshot.initiativeId);
      const openAlerts = alerts.filter(a => a.status === "OPEN");

      const recentDeltas = deltas.map(d => ({
        fieldPath: d.fieldPath,
        oldValue: d.oldValue,
        newValue: d.newValue,
      }));

      const alertsSummary = openAlerts.map(a => ({
        signalCode: a.signalCode,
        severity: a.severity,
        rationale: a.rationale || "",
      }));

      const recommendedAction = determineRecommendedAction(alertsSummary);

      initiativeSummaries.push({
        id: snapshot.initiativeId,
        title: snapshot.title,
        type: snapshot.projectType,
        businessUnit: snapshot.departmentName,
        gate: snapshot.status,
        scores: {
          value: snapshot.totalValor,
          effort: snapshot.totalEsfuerzo,
          total: snapshot.puntajeTotal,
        },
        recentDeltas,
        openAlerts: alertsSummary,
        dataQualityScore: null,
        recommendedAction,
      });
    }

    const summaryJson = {
      generatedAt: new Date().toISOString(),
      initiativeCount: initiativeSummaries.length,
      initiatives: initiativeSummaries,
    };

    await storage.updateCommitteePacket(packet.id, {
      status: "COMPLETED",
      summaryJson,
    });

    return {
      packetId: packet.id,
      initiativeCount: initiativeSummaries.length,
    };
  } catch (error) {
    await storage.updateCommitteePacket(packet.id, {
      status: "FAILED",
    });
    throw error;
  }
}
