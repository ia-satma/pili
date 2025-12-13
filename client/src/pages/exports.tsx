import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Download, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface ExportArtifact {
  id: number;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

interface ExportBatch {
  id: number;
  status: string;
  exportType: string;
  createdAt: string;
  completedAt: string | null;
  artifact: ExportArtifact | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="default" data-testid="badge-status-completed">Completado</Badge>;
    case "processing":
      return <Badge variant="secondary" data-testid="badge-status-processing">Procesando</Badge>;
    case "failed":
      return <Badge variant="destructive" data-testid="badge-status-failed">Error</Badge>;
    default:
      return <Badge variant="outline" data-testid="badge-status-pending">Pendiente</Badge>;
  }
}

export default function Exports() {
  useDocumentTitle("Exportar - PMO Dashboard");
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ exports: ExportBatch[] }>({
    queryKey: ["/api/exports"],
    refetchInterval: 5000,
  });

  const runExportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/exports/run", {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Exportación iniciada",
        description: `Trabajo #${data.jobId} encolado correctamente`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/exports"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo iniciar la exportación",
        variant: "destructive",
      });
    },
  });

  const handleDownload = (artifactId: number, fileName: string) => {
    const link = document.createElement("a");
    link.href = `/api/exports/${artifactId}/download`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exports = data?.exports || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Exportar Datos</h1>
          <p className="text-muted-foreground">
            Genera y descarga archivos Excel con los datos de iniciativas
          </p>
        </div>
        <Button
          onClick={() => runExportMutation.mutate()}
          disabled={runExportMutation.isPending}
          data-testid="button-run-export"
        >
          {runExportMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4 mr-2" />
          )}
          Generar Exportación
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Exportaciones</CardTitle>
          <CardDescription>
            Lista de exportaciones generadas anteriormente
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : exports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-empty-state">
              No hay exportaciones registradas
            </div>
          ) : (
            <div className="space-y-3">
              {exports.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between p-4 border rounded-md"
                  data-testid={`row-export-${exp.id}`}
                >
                  <div className="flex items-center gap-4">
                    <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <div className="font-medium" data-testid={`text-export-name-${exp.id}`}>
                        {exp.artifact?.fileName || `Exportación #${exp.id}`}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(exp.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
                        {exp.artifact && (
                          <span className="ml-2">
                            ({formatFileSize(exp.artifact.fileSize)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(exp.status)}
                    {exp.status === "completed" && exp.artifact && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(exp.artifact!.id, exp.artifact!.fileName)}
                        data-testid={`button-download-${exp.id}`}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Descargar
                      </Button>
                    )}
                    {exp.status === "processing" && (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
