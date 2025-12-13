import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { storage } from "../storage";
import type { InsertExportBatch, InsertExportArtifact, InitiativeSnapshot } from "@shared/schema";

interface ExportResult {
  artifactId: number;
  batchId: number;
  fileSize: number;
}

export async function generateExportExcel(
  requestedBy?: string,
  filterCriteria: Record<string, unknown> = {}
): Promise<ExportResult> {
  const batch = await storage.createExportBatch({
    status: "processing",
    exportType: "excel",
    filterCriteria,
    requestedBy: requestedBy || null,
  });

  try {
    const snapshots = await storage.getLatestSnapshotPerInitiative();
    const alertCounts = await storage.getAlertCountByInitiative();

    const workbook = XLSX.utils.book_new();

    const rows = snapshots.map((snapshot: InitiativeSnapshot) => ({
      "Title": snapshot.title || "",
      "Type": snapshot.projectType || "",
      "Business Unit": snapshot.departmentName || "",
      "Current Stage/Gate": snapshot.status || "",
      "Total Valor": snapshot.totalValor ?? "",
      "Total Esfuerzo": snapshot.totalEsfuerzo ?? "",
      "Puntaje Total": snapshot.puntajeTotal ?? "",
      "Status": snapshot.estatusAlDia || snapshot.status || "",
      "Open Alerts Count": alertCounts.get(snapshot.initiativeId) ?? 0,
      "Last Update": snapshot.createdAt ? new Date(snapshot.createdAt).toISOString().split("T")[0] : "",
      "Percent Complete": snapshot.percentComplete ?? "",
      "Owner": snapshot.owner || "",
      "Sponsor": snapshot.sponsor || "",
      "Priority": snapshot.priority || "",
      "Start Date": snapshot.startDate || "",
      "End Date Estimated": snapshot.endDateEstimated || "",
      "End Date Actual": snapshot.endDateActual || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    const colWidths = [
      { wch: 40 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 20 },
      { wch: 10 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
    ];
    worksheet["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, "Initiatives Export");

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const contentSha256 = createHash("sha256").update(excelBuffer).digest("hex");
    const now = new Date();
    const fileName = `initiatives_export_${now.toISOString().split("T")[0]}.xlsx`;

    const artifact = await storage.createExportArtifact({
      batchId: batch.id,
      fileContent: excelBuffer,
      fileName,
      fileSize: excelBuffer.length,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      contentSha256,
    });

    await storage.updateExportBatch(batch.id, {
      status: "completed",
      completedAt: new Date(),
    });

    return {
      artifactId: artifact.id,
      batchId: batch.id,
      fileSize: excelBuffer.length,
    };
  } catch (error) {
    await storage.updateExportBatch(batch.id, {
      status: "failed",
      completedAt: new Date(),
    });
    throw error;
  }
}
