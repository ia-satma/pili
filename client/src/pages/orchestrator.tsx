import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import {
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  ListChecks,
  Send,
  Loader2,
  HelpCircle,
  FileText,
  Database,
} from "lucide-react";

type OrchestratorMode = "BRAINSTORM" | "DECIDE" | "RISKS" | "NEXT_ACTIONS";

interface OrchestratorResponse {
  summary: string;
  ideas: string[];
  risks: string[];
  nextActions: string[];
  questionsToClairfy: string[];
  evidenceRefs: {
    batchIds: number[];
    snapshotIds: number[];
    alertIds: number[];
    deltaIds: number[];
  } | null;
  insufficientEvidence: boolean;
  missingFields: string[];
}

interface Initiative {
  id: number;
  title: string;
  owner: string | null;
  currentStatus: string | null;
  isActive: boolean;
}

const modeConfig: Record<OrchestratorMode, { label: string; icon: typeof Lightbulb; description: string }> = {
  BRAINSTORM: {
    label: "Lluvia de Ideas",
    icon: Lightbulb,
    description: "Genera ideas creativas y alternativas para abordar la situación",
  },
  DECIDE: {
    label: "Decidir",
    icon: CheckCircle2,
    description: "Ayuda a tomar una decisión estructurada con pros y contras",
  },
  RISKS: {
    label: "Riesgos",
    icon: AlertTriangle,
    description: "Identifica y analiza riesgos potenciales con mitigaciones",
  },
  NEXT_ACTIONS: {
    label: "Próximos Pasos",
    icon: ListChecks,
    description: "Define los próximos pasos concretos y priorizados",
  },
};

export default function Orchestrator() {
  useDocumentTitle("Orquestador PMO");
  const { toast } = useToast();

  const [mode, setMode] = useState<OrchestratorMode>("BRAINSTORM");
  const [initiativeId, setInitiativeId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<OrchestratorResponse | null>(null);

  const { data: initiatives = [], isLoading: loadingInitiatives } = useQuery<Initiative[]>({
    queryKey: ["/api/initiatives"],
  });

  const bounceMutation = useMutation({
    mutationFn: async (data: { initiativeId?: number; message: string; mode: OrchestratorMode }) => {
      const res = await apiRequest("POST", "/api/orchestrator/bounce", data);
      return res.json() as Promise<OrchestratorResponse>;
    },
    onSuccess: (data) => {
      setResponse(data);
      if (data.insufficientEvidence) {
        toast({
          title: "Evidencia insuficiente",
          description: "El orquestador no tiene suficiente información para una respuesta completa.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Error al procesar la solicitud",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!message.trim()) {
      toast({
        title: "Mensaje requerido",
        description: "Por favor ingresa un mensaje para el orquestador.",
        variant: "destructive",
      });
      return;
    }

    bounceMutation.mutate({
      initiativeId: initiativeId ? parseInt(initiativeId) : undefined,
      message: message.trim(),
      mode,
    });
  };

  const ModeIcon = modeConfig[mode].icon;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          Orquestador PMO
        </h1>
        <p className="text-muted-foreground mt-1">
          Asistente estratégico para gestión de proyectos basado en evidencia
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuración</CardTitle>
            <CardDescription>Selecciona el modo y contexto para tu consulta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mode-select">Modo de Operación</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as OrchestratorMode)}>
                <SelectTrigger id="mode-select" data-testid="select-mode">
                  <SelectValue placeholder="Selecciona un modo" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(modeConfig) as OrchestratorMode[]).map((m) => {
                    const config = modeConfig[m];
                    const Icon = config.icon;
                    return (
                      <SelectItem key={m} value={m} data-testid={`select-mode-${m.toLowerCase()}`}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{config.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{modeConfig[mode].description}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="initiative-select">Iniciativa (opcional)</Label>
              {loadingInitiatives ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={initiativeId} onValueChange={setInitiativeId}>
                  <SelectTrigger id="initiative-select" data-testid="select-initiative">
                    <SelectValue placeholder="Sin contexto de iniciativa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin contexto de iniciativa</SelectItem>
                    {initiatives.map((init) => (
                      <SelectItem
                        key={init.id}
                        value={init.id.toString()}
                        data-testid={`select-initiative-${init.id}`}
                      >
                        {init.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                Selecciona una iniciativa para proporcionar contexto al orquestador
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ModeIcon className="h-5 w-5" />
              {modeConfig[mode].label}
            </CardTitle>
            <CardDescription>Escribe tu consulta para el orquestador</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="message-input">Mensaje</Label>
              <Textarea
                id="message-input"
                placeholder="Describe tu situación o pregunta..."
                className="min-h-[120px] resize-none"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                data-testid="input-message"
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={bounceMutation.isPending || !message.trim()}
              className="w-full"
              data-testid="button-submit"
            >
              {bounceMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Consulta
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {response && (
        <div className="space-y-4" data-testid="response-container">
          {response.insufficientEvidence && (
            <Alert variant="destructive" data-testid="alert-insufficient-evidence">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Evidencia Insuficiente</AlertTitle>
              <AlertDescription>
                {response.missingFields.length > 0 && (
                  <span>Campos faltantes: {response.missingFields.join(", ")}</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Resumen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm" data-testid="text-summary">
                {response.summary || "Sin resumen disponible"}
              </p>
            </CardContent>
          </Card>

          {response.ideas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Ideas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2" data-testid="list-ideas">
                  {response.ideas.map((idea, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="shrink-0 mt-0.5">
                        {i + 1}
                      </Badge>
                      <span>{idea}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {response.risks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Riesgos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2" data-testid="list-risks">
                  {response.risks.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="destructive" className="shrink-0 mt-0.5">
                        {i + 1}
                      </Badge>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {response.nextActions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-green-500" />
                  Próximos Pasos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2" data-testid="list-next-actions">
                  {response.nextActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="default" className="shrink-0 mt-0.5">
                        {i + 1}
                      </Badge>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {response.questionsToClairfy.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-blue-500" />
                  Preguntas a Clarificar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2" data-testid="list-questions">
                  {response.questionsToClairfy.map((q, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="secondary" className="shrink-0 mt-0.5">
                        ?
                      </Badge>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {response.evidenceRefs && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Referencias de Evidencia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2" data-testid="evidence-refs">
                  {response.evidenceRefs.batchIds.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Batches:</span>
                      {response.evidenceRefs.batchIds.map((id) => (
                        <Badge key={`batch-${id}`} variant="outline" className="text-xs">
                          #{id}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {response.evidenceRefs.snapshotIds.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Snapshots:</span>
                      {response.evidenceRefs.snapshotIds.map((id) => (
                        <Badge key={`snap-${id}`} variant="outline" className="text-xs">
                          #{id}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {response.evidenceRefs.alertIds.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Alertas:</span>
                      {response.evidenceRefs.alertIds.map((id) => (
                        <Badge key={`alert-${id}`} variant="outline" className="text-xs">
                          #{id}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {response.evidenceRefs.deltaIds.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Deltas:</span>
                      {response.evidenceRefs.deltaIds.slice(0, 5).map((id) => (
                        <Badge key={`delta-${id}`} variant="outline" className="text-xs">
                          #{id}
                        </Badge>
                      ))}
                      {response.evidenceRefs.deltaIds.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{response.evidenceRefs.deltaIds.length - 5} más
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
