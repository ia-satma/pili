import { storage } from "../storage";

const ZOMBI_DAYS_THRESHOLD = 21;

interface LimboDetectionResult {
  totalAlerts: number;
  zombiAlerts: number;
  missingSnapshotAlerts: number;
  initiativesChecked: number;
}

export async function runBatchIndependentLimboDetection(): Promise<LimboDetectionResult> {
  const initiativesData = await storage.getInitiativesForLimboCheck();
  const now = new Date();
  
  let totalAlerts = 0;
  let zombiAlerts = 0;
  let missingSnapshotAlerts = 0;

  for (const { initiative, latestSnapshot, latestStatusUpdate } of initiativesData) {
    const existingZombiAlert = await storage.getOpenAlertBySignal(initiative.id, "ZOMBI");
    if (!existingZombiAlert) {
      let isZombi = false;
      let zombiReason = "";

      if (!latestStatusUpdate) {
        const createdAt = initiative.createdAt || now;
        const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceCreation > ZOMBI_DAYS_THRESHOLD) {
          isZombi = true;
          zombiReason = `No status updates since creation (${daysSinceCreation} days ago)`;
        }
      } else {
        const lastUpdateDate = latestStatusUpdate.createdAt || now;
        const daysSinceUpdate = Math.floor((now.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceUpdate > ZOMBI_DAYS_THRESHOLD) {
          isZombi = true;
          zombiReason = `No status updates in ${daysSinceUpdate} days`;
        }
      }

      if (isZombi) {
        await storage.createGovernanceAlert({
          initiativeId: initiative.id,
          signalCode: "ZOMBI",
          severity: "MEDIUM",
          message: zombiReason,
          status: "OPEN",
          detectedAt: now,
        });
        zombiAlerts++;
        totalAlerts++;
      }
    }

    const existingMissingSnapshotAlert = await storage.getOpenAlertBySignal(initiative.id, "MISSING_SNAPSHOT");
    if (!existingMissingSnapshotAlert && !latestSnapshot) {
      await storage.createGovernanceAlert({
        initiativeId: initiative.id,
        signalCode: "MISSING_SNAPSHOT",
        severity: "MEDIUM",
        message: "Initiative has no snapshots recorded",
        status: "OPEN",
        detectedAt: now,
      });
      missingSnapshotAlerts++;
      totalAlerts++;
    }
  }

  return {
    totalAlerts,
    zombiAlerts,
    missingSnapshotAlerts,
    initiativesChecked: initiativesData.length,
  };
}
