import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ArrowLeft, History, Database, RefreshCw, AlertTriangle } from "lucide-react";
import type { Initiative, InitiativeSnapshot, DeltaEvent, GovernanceAlert } from "@shared/schema";

interface SnapshotsResponse {
  initiative: Initiative;
  snapshots: InitiativeSnapshot[];
  totalSnapshots: number;
}

interface DeltasResponse {
  deltas: DeltaEvent[];
}

interface AlertsResponse {
  alerts: GovernanceAlert[];
}

function getSeverityVariant(severity: string): "destructive" | "default" | "secondary" {
  switch (severity) {
    case "RISK":
    case "HIGH":
      return "destructive";
    case "WARN":
    case "MEDIUM":
      return "default";
    default:
      return "secondary";
  }
}

function getSignalLabel(code: string): string {
  const labels: Record<string, string> = {
    ZOMBI: "Zombi",
    ANGUILA: "Anguila",
    OPTIMISTA: "Optimista",
    INDECISO: "Indeciso",
    DRENAJE_DE_VALOR: "Drenaje de Valor",
  };
  return labels[code] || code;
}

function formatFieldPath(path: string): string {
  const parts = path.split(".");
  if (parts.length < 2) return path;
  return parts[1].replace(/([A-Z])/g, " $1").trim();
}

export default function InitiativeDetail() {
  const params = useParams();
  const id = params.id;
  
  useDocumentTitle("Detalle de Iniciativa");
  
  const { data, isLoading } = useQuery<SnapshotsResponse>({
    queryKey: ['/api/initiatives', id, 'snapshots'],
    enabled: !!id,
  });

  const { data: deltasData } = useQuery<DeltasResponse>({
    queryKey: ['/api/initiatives', id, 'deltas'],
    enabled: !!id,
  });

  const { data: alertsData } = useQuery<AlertsResponse>({
    queryKey: ['/api/initiatives', id, 'alerts'],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data?.initiative) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Iniciativa no encontrada</p>
        <Link href="/initiatives">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a iniciativas
          </Button>
        </Link>
      </div>
    );
  }

  const { initiative, snapshots } = data;
  const deltas = deltasData?.deltas || [];
  const alerts = alertsData?.alerts || [];
  const openAlerts = alerts.filter(a => a.status === "OPEN");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/initiatives">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold" data-testid="heading-initiative-title">{initiative.title}</h1>
          <p className="text-muted-foreground">ID: {initiative.id}</p>
        </div>
      </div>

      <Card data-testid="card-initiative-info">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Información de la Iniciativa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="font-medium" data-testid="text-owner">{initiative.owner || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status Actual</p>
              <p className="font-medium" data-testid="text-status">{initiative.currentStatus || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">DevOps Card ID</p>
              <p className="font-mono text-sm" data-testid="text-devops-id">{initiative.devopsCardId || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">PowerSteering ID</p>
              <p className="font-mono text-sm" data-testid="text-ps-id">{initiative.powerSteeringId || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-active-alerts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alertas Activas
          </CardTitle>
          <CardDescription>{openAlerts.length} alerta(s) activa(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {openAlerts.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="text-no-alerts">
              No hay alertas activas para esta iniciativa.
            </p>
          ) : (
            <div className="space-y-3">
              {openAlerts.map((alert) => (
                <div 
                  key={alert.id} 
                  className="flex items-start gap-3 p-3 border rounded-md"
                  data-testid={`alert-item-${alert.id}`}
                >
                  <Badge variant={getSeverityVariant(alert.severity)} className="mt-0.5">
                    {alert.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="font-mono text-xs">
                        {getSignalLabel(alert.signalCode)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(alert.detectedAt).toLocaleDateString("es-MX", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{alert.rationale}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-recent-changes">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Cambios Recientes
          </CardTitle>
          <CardDescription>{deltas.length} cambio(s) detectado(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {deltas.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="text-no-deltas">
              No hay cambios registrados entre snapshots.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>Valor Anterior</TableHead>
                  <TableHead>Valor Nuevo</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deltas.slice(0, 20).map((delta) => (
                  <TableRow key={delta.id} data-testid={`row-delta-${delta.id}`}>
                    <TableCell className="font-medium text-sm">
                      {formatFieldPath(delta.fieldPath)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate" title={delta.oldValue || ""}>
                      {delta.oldValue || "-"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[150px] truncate" title={delta.newValue || ""}>
                      {delta.newValue || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getSeverityVariant(delta.severity)} className="text-xs">
                        {delta.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(delta.detectedAt).toLocaleDateString("es-MX", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-snapshots-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Snapshots
          </CardTitle>
          <CardDescription>{snapshots.length} snapshot(s) registrados</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="text-no-snapshots">
              No hay snapshots para esta iniciativa.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>% Avance</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Esfuerzo</TableHead>
                  <TableHead>Puntaje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((snap) => (
                  <TableRow key={snap.id} data-testid={`row-snapshot-${snap.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        Batch #{snap.batchId}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(snap.createdAt).toLocaleDateString("es-MX", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>{snap.status || snap.estatusAlDia || "-"}</TableCell>
                    <TableCell>{snap.percentComplete ?? "-"}%</TableCell>
                    <TableCell className="font-mono">{snap.totalValor ?? "-"}</TableCell>
                    <TableCell className="font-mono">{snap.totalEsfuerzo ?? "-"}</TableCell>
                    <TableCell className="font-mono font-bold">{snap.puntajeTotal ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
