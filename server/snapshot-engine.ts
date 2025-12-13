import { storage } from "./storage";
import { resolveOrCreateInitiative } from "./identity-resolution";
import type { InsertInitiativeSnapshot, InsertValidationIssue } from "@shared/schema";

interface ExcelRowData {
  // Identity
  devopsCardId?: string;
  powerSteeringId?: string;
  title: string;
  owner?: string;
  
  // Snapshot data
  description?: string;
  sponsor?: string;
  departmentName?: string;
  status?: string;
  estatusAlDia?: string;
  priority?: string;
  category?: string;
  projectType?: string;
  startDate?: string;
  endDateEstimated?: string;
  endDateActual?: string;
  percentComplete?: number;
  
  // Excel totals (for comparison)
  totalValor?: number;
  totalEsfuerzo?: number;
  puntajeTotal?: number;
  ranking?: number;
  
  // Raw row for storage
  rawRow: Record<string, unknown>;
}

/**
 * Process a batch of Excel rows and create snapshots.
 * Called when ingestion_batch is COMMITTED.
 */
export async function createSnapshotsFromBatch(
  batchId: number,
  rows: ExcelRowData[]
): Promise<{ created: number; skipped: number; warnings: InsertValidationIssue[] }> {
  const warnings: InsertValidationIssue[] = [];
  let created = 0;
  let skipped = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // Excel rows start at 2 (after header)
    
    // Resolve or create initiative
    const initiativeId = await resolveOrCreateInitiative({
      devopsCardId: row.devopsCardId,
      powerSteeringId: row.powerSteeringId,
      title: row.title,
      owner: row.owner,
    });
    
    if (!initiativeId) {
      skipped++;
      continue;
    }
    
    // Calculate totals from criteria (placeholder - real logic depends on scoring model)
    // For now, use Excel values as calculated values
    const calculatedValor = row.totalValor || 0;
    const calculatedEsfuerzo = row.totalEsfuerzo || 0;
    const calculatedTotal = calculatedValor + calculatedEsfuerzo;
    
    // Check for TOTAL_MISMATCH
    if (row.puntajeTotal && row.puntajeTotal !== calculatedTotal) {
      warnings.push({
        batchId,
        severity: "soft",
        code: "TOTAL_MISMATCH",
        rowNumber,
        columnName: "PUNTAJE TOTAL",
        rawValue: String(row.puntajeTotal),
        message: `Excel total (${row.puntajeTotal}) differs from calculated (${calculatedTotal})`,
      });
    }
    
    // Create snapshot (NEVER update existing)
    const snapshotData: InsertInitiativeSnapshot = {
      initiativeId,
      batchId,
      title: row.title,
      description: row.description || null,
      owner: row.owner || null,
      sponsor: row.sponsor || null,
      departmentName: row.departmentName || null,
      status: row.status || null,
      estatusAlDia: row.estatusAlDia || null,
      priority: row.priority || null,
      category: row.category || null,
      projectType: row.projectType || null,
      startDate: row.startDate || null,
      endDateEstimated: row.endDateEstimated || null,
      endDateActual: row.endDateActual || null,
      percentComplete: row.percentComplete || null,
      totalValor: calculatedValor,
      totalEsfuerzo: calculatedEsfuerzo,
      puntajeTotal: calculatedTotal,
      ranking: row.ranking || null,
      excelTotalValor: row.totalValor || null,
      excelTotalEsfuerzo: row.totalEsfuerzo || null,
      excelPuntajeTotal: row.puntajeTotal || null,
      rawExcelRow: row.rawRow,
    };
    
    await storage.createInitiativeSnapshot(snapshotData);
    created++;
    
    // Update initiative current status
    await storage.updateInitiative(initiativeId, {
      currentStatus: row.status,
      updatedAt: new Date(),
    });
  }
  
  // Persist all warnings
  for (const warning of warnings) {
    await storage.createValidationIssue(warning);
  }
  
  return { created, skipped, warnings };
}

export type { ExcelRowData };
