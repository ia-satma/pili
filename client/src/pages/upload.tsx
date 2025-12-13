import { ExcelUpload } from "@/components/excel-upload";
import { IngestionStatus } from "@/components/ingestion-status";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function Upload() {
  useDocumentTitle("Cargar Excel");
  
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="heading-upload">Cargar Excel</h1>
        <p className="text-muted-foreground">
          Sube la matriz de proyectos para actualizar el sistema
        </p>
      </div>

      {/* Excel Upload Component */}
      <ExcelUpload />

      {/* H1 Ingestion Status */}
      <IngestionStatus />
    </div>
  );
}
