import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, AlertTriangle, TrendingUp, TrendingDown, Minus, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";

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
  recommendedAction: string;
}

interface CommitteePacket {
  id: number;
  status: string;
  createdAt: string;
  summaryJson: {
    generatedAt: string;
    initiativeCount: number;
    initiatives: InitiativeSummary[];
  } | null;
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case "HIGH":
      return <Badge variant="destructive">Alta</Badge>;
    case "MEDIUM":
      return <Badge variant="default">Media</Badge>;
    default:
      return <Badge variant="secondary">Baja</Badge>;
  }
}

function getSignalLabel(signalCode: string): string {
  const labels: Record<string, string> = {
    ZOMBI: "Proyecto Zombi",
    ANGUILA: "Proyecto Anguila",
    OPTIMISTA: "Fechas Optimistas",
    INDECISO: "Proyecto Indeciso",
    DRENAJE_DE_VALOR: "Drenaje de Valor",
  };
  return labels[signalCode] || signalCode;
}

function getDeltaIcon(fieldPath: string, oldValue: string | null, newValue: string | null) {
  if (fieldPath.includes("score") || fieldPath.includes("percent")) {
    const oldNum = parseFloat(oldValue || "0");
    const newNum = parseFloat(newValue || "0");
    if (newNum > oldNum) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (newNum < oldNum) return <TrendingDown className="h-4 w-4 text-red-500" />;
  }
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export default function CommitteeDetail() {
  const params = useParams<{ id: string }>();
  const packetId = parseInt(params.id || "0");
  
  useDocumentTitle(`Paquete #${packetId} - Comité - PMO Dashboard`);

  const { data, isLoading, error } = useQuery<{ packet: CommitteePacket }>({
    queryKey: ["/api/committee/packets", packetId],
    enabled: packetId > 0,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data?.packet) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground" data-testid="text-error">
            Paquete no encontrado
          </p>
          <Link href="/committee">
            <Button variant="outline" className="mt-4" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Comité
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { packet } = data;
  const initiatives = packet.summaryJson?.initiatives || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/committee">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Paquete de Comité #{packet.id}
          </h1>
          <p className="text-muted-foreground">
            Generado el {format(new Date(packet.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
            {" · "}{initiatives.length} iniciativas
          </p>
        </div>
      </div>

      {initiatives.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground" data-testid="text-empty-state">
              Este paquete no contiene iniciativas
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {initiatives.map((initiative) => (
            <Card key={initiative.id} data-testid={`card-initiative-${initiative.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg" data-testid={`text-initiative-title-${initiative.id}`}>
                      {initiative.title}
                    </CardTitle>
                    <CardDescription>
                      {initiative.businessUnit && <span>{initiative.businessUnit}</span>}
                      {initiative.type && <span className="ml-2">· {initiative.type}</span>}
                      {initiative.gate && <span className="ml-2">· Gate: {initiative.gate}</span>}
                    </CardDescription>
                  </div>
                  <Link href={`/initiatives/${initiative.id}`}>
                    <Button variant="outline" size="sm" data-testid={`link-initiative-${initiative.id}`}>
                      Ver Detalle
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-muted/50 rounded-md">
                    <div className="text-sm text-muted-foreground mb-1">Puntajes</div>
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-xs text-muted-foreground">Valor: </span>
                        <span className="font-medium" data-testid={`text-score-value-${initiative.id}`}>
                          {initiative.scores.value ?? "-"}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Esfuerzo: </span>
                        <span className="font-medium" data-testid={`text-score-effort-${initiative.id}`}>
                          {initiative.scores.effort ?? "-"}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Total: </span>
                        <span className="font-semibold" data-testid={`text-score-total-${initiative.id}`}>
                          {initiative.scores.total ?? "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-md">
                    <div className="text-sm text-muted-foreground mb-1">Calidad de Datos</div>
                    <div className="font-medium" data-testid={`text-quality-${initiative.id}`}>
                      {initiative.dataQualityScore !== null
                        ? `${initiative.dataQualityScore}%`
                        : "Sin calcular"}
                    </div>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-md">
                    <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      Acción Recomendada
                    </div>
                    <div className="font-medium text-sm" data-testid={`text-action-${initiative.id}`}>
                      {initiative.recommendedAction || "Sin recomendación"}
                    </div>
                  </div>
                </div>

                {initiative.openAlerts.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Alertas Activas
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {initiative.openAlerts.map((alert, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-sm border px-2 py-1 rounded"
                          data-testid={`alert-${initiative.id}-${idx}`}
                        >
                          {getSeverityBadge(alert.severity)}
                          <span>{getSignalLabel(alert.signalCode)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {initiative.recentDeltas.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Cambios Recientes</div>
                    <div className="space-y-1">
                      {initiative.recentDeltas.slice(0, 5).map((delta, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                          data-testid={`delta-${initiative.id}-${idx}`}
                        >
                          {getDeltaIcon(delta.fieldPath, delta.oldValue, delta.newValue)}
                          <span className="font-medium">{delta.fieldPath}:</span>
                          <span className="line-through">{delta.oldValue || "(vacío)"}</span>
                          <span>→</span>
                          <span>{delta.newValue || "(vacío)"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
