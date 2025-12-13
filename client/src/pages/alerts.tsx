import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type { GovernanceAlert, Initiative } from "@shared/schema";

interface AlertsResponse {
  alerts: (GovernanceAlert & { initiative?: Initiative })[];
}

function getSeverityVariant(severity: string): "destructive" | "default" | "secondary" {
  switch (severity) {
    case "HIGH":
      return "destructive";
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

function getSignalDescription(code: string): string {
  const descriptions: Record<string, string> = {
    ZOMBI: "Sin actualizaciones de estado en más de 21 días",
    ANGUILA: "Fecha estimada de fin movida >15 días en 3 snapshots consecutivos",
    OPTIMISTA: "Puntaje aumentó >20% sin nuevas evaluaciones",
    INDECISO: "Campo cambió A→B→A en menos de 4 semanas",
    DRENAJE_DE_VALOR: "Valor total disminuyó en snapshots consecutivos",
  };
  return descriptions[code] || "";
}

export default function Alerts() {
  useDocumentTitle("Alertas de Gobernanza");

  const { data, isLoading } = useQuery<AlertsResponse>({
    queryKey: ['/api/alerts', { status: 'OPEN' }],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const alerts = data?.alerts || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="heading-alerts">Alertas de Gobernanza</h1>
        <p className="text-muted-foreground">Señales de riesgo detectadas en las iniciativas</p>
      </div>

      {alerts.length === 0 ? (
        <Card data-testid="card-no-alerts">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground" data-testid="text-no-alerts">
              No hay alertas activas en este momento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4" data-testid="grid-alerts">
          {alerts.map((alert) => (
            <Card key={alert.id} data-testid={`card-alert-${alert.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant={getSeverityVariant(alert.severity)} data-testid={`badge-severity-${alert.id}`}>
                      {alert.severity}
                    </Badge>
                    <Badge variant="outline" className="font-mono" data-testid={`badge-signal-${alert.id}`}>
                      {getSignalLabel(alert.signalCode)}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground" data-testid={`text-date-${alert.id}`}>
                    {new Date(alert.detectedAt).toLocaleDateString("es-MX", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <CardTitle className="text-lg mt-2" data-testid={`text-initiative-title-${alert.id}`}>
                  {alert.initiative?.title || `Iniciativa #${alert.initiativeId}`}
                </CardTitle>
                <CardDescription>{getSignalDescription(alert.signalCode)}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4" data-testid={`text-rationale-${alert.id}`}>
                  {alert.rationale}
                </p>
                <Link href={`/initiatives/${alert.initiativeId}`}>
                  <Button variant="outline" size="sm" data-testid={`button-view-initiative-${alert.id}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ver Iniciativa
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
