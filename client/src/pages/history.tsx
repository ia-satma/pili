import { VersionComparison } from "@/components/version-comparison";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function History() {
  useDocumentTitle("Historial");
  
  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historial</h1>
        <p className="text-muted-foreground">
          Control de versiones y bitácora de cambios
        </p>
      </div>

      {/* Version Comparison */}
      <VersionComparison />
    </div>
  );
}
