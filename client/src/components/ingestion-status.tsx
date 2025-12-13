import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, AlertCircle, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { IngestionBatch, ValidationIssue } from "@shared/schema";

interface BatchWithArtifact extends IngestionBatch {
  artifactId: number | null;
  artifactFileName: string | null;
}

interface BatchesResponse {
  batches: BatchWithArtifact[];
}

interface IssuesResponse {
  batch: IngestionBatch;
  issues: ValidationIssue[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case "committed":
      return <Badge variant="default" className="bg-green-600" data-testid="badge-status-committed"><CheckCircle2 className="w-3 h-3 mr-1" />Committed</Badge>;
    case "failed":
      return <Badge variant="destructive" data-testid="badge-status-failed"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case "processing":
      return <Badge variant="secondary" data-testid="badge-status-processing"><Clock className="w-3 h-3 mr-1" />Processing</Badge>;
    default:
      return <Badge variant="outline" data-testid="badge-status-pending">Pending</Badge>;
  }
}

function getSeverityIcon(severity: string) {
  return severity === "hard" 
    ? <AlertCircle className="w-4 h-4 text-destructive" /> 
    : <AlertTriangle className="w-4 h-4 text-yellow-500" />;
}

export function IngestionStatus() {
  const { data: batchesData, isLoading: batchesLoading } = useQuery<BatchesResponse>({
    queryKey: ["/api/ingest/batches"],
  });

  const latestBatch = batchesData?.batches?.[0];

  const { data: issuesData, isLoading: issuesLoading } = useQuery<IssuesResponse>({
    queryKey: ["/api/ingest/batches", latestBatch?.id, "issues"],
    enabled: !!latestBatch?.id,
  });

  const handleDownload = async (artifactId: number) => {
    window.open(`/api/ingest/artifacts/${artifactId}/download`, "_blank");
  };

  if (batchesLoading) {
    return (
      <Card data-testid="card-ingestion-status">
        <CardHeader>
          <CardTitle>Estado de Ingesta</CardTitle>
          <CardDescription>Último lote de carga</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!latestBatch) {
    return (
      <Card data-testid="card-ingestion-status-empty">
        <CardHeader>
          <CardTitle>Estado de Ingesta</CardTitle>
          <CardDescription>Último lote de carga</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm" data-testid="text-no-batches">
            No hay lotes de ingesta registrados.
          </p>
        </CardContent>
      </Card>
    );
  }

  const issues = issuesData?.issues || [];

  return (
    <div className="space-y-4">
      <Card data-testid="card-ingestion-status">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Estado de Ingesta</CardTitle>
            <CardDescription>Último lote: {latestBatch.sourceFileName}</CardDescription>
          </div>
          {getStatusBadge(latestBatch.status)}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Filas</p>
              <p className="text-lg font-semibold" data-testid="text-total-rows">{latestBatch.totalRows}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Procesadas</p>
              <p className="text-lg font-semibold" data-testid="text-processed-rows">{latestBatch.processedRows}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Errores Críticos</p>
              <p className="text-lg font-semibold text-destructive" data-testid="text-hard-errors">
                {latestBatch.hardErrorCount}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Advertencias</p>
              <p className="text-lg font-semibold text-yellow-600" data-testid="text-soft-errors">
                {latestBatch.softErrorCount}
              </p>
            </div>
          </div>
          {latestBatch.artifactId && (
            <div className="mt-4 flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleDownload(latestBatch.artifactId!)}
                data-testid="button-download-artifact"
              >
                <Download className="w-4 h-4 mr-2" />
                Descargar Archivo Original
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {issues.length > 0 && (
        <Card data-testid="card-validation-issues">
          <CardHeader>
            <CardTitle>Problemas de Validación</CardTitle>
            <CardDescription>{issues.length} problema(s) encontrado(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Tipo</TableHead>
                  <TableHead className="w-16">Fila</TableHead>
                  <TableHead className="w-24">Columna</TableHead>
                  <TableHead>Mensaje</TableHead>
                  <TableHead className="w-32">Código</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.slice(0, 20).map((issue) => (
                  <TableRow key={issue.id} data-testid={`row-issue-${issue.id}`}>
                    <TableCell>{getSeverityIcon(issue.severity)}</TableCell>
                    <TableCell className="font-mono text-xs">{issue.rowNumber || "-"}</TableCell>
                    <TableCell className="text-xs">{issue.columnName || "-"}</TableCell>
                    <TableCell className="text-sm">{issue.message}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{issue.code}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {issues.length > 20 && (
              <p className="text-xs text-muted-foreground mt-2" data-testid="text-more-issues">
                Mostrando 20 de {issues.length} problemas
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
