import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Settings, FileText, Bot, Play, RefreshCw, CheckCircle, XCircle, Clock, Loader2, AlertTriangle, Zap, Key } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Job {
  id: number;
  jobType: string;
  status: string;
  payload: Record<string, unknown>;
  runAt: string;
  createdAt: string;
  attempts: number;
  maxAttempts: number;
}

interface SystemDoc {
  id: number;
  docType: string;
  title: string;
  content: string;
  generatedAt: string;
}

interface Agent {
  name: string;
  purpose: string | null;
  enabled: boolean;
  activeVersion: string | null;
}

interface AgentHealth {
  overall: "healthy" | "degraded" | "unhealthy";
  keys: {
    openai: { name: string; configured: boolean };
    anthropic: { name: string; configured: boolean };
    google: { name: string; configured: boolean };
  };
  agents: { name: string; enabled: boolean; purpose: string | null }[];
  enabledCount: number;
  totalCount: number;
}

interface SmokeTestResult {
  runId: number;
  status: string;
  duration: number;
  initiativeId: number;
  initiativeName: string;
  blockedReason?: string;
}

function getJobStatusBadge(status: string) {
  switch (status) {
    case "SUCCEEDED":
      return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" />Completado</Badge>;
    case "FAILED":
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Fallido</Badge>;
    case "RUNNING":
      return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Ejecutando</Badge>;
    case "QUEUED":
      return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />En cola</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getJobTypeLabel(jobType: string): string {
  const labels: Record<string, string> = {
    GENERATE_EXPORT_EXCEL: "Exportar Excel",
    GENERATE_COMMITTEE_PACKET: "Paquete Comité",
    DETECT_LIMBO: "Detectar Limbo",
    DRAFT_CHASERS: "Borradores Chaser",
    GENERATE_SYSTEM_DOCS: "Generar Documentación",
  };
  return labels[jobType] || jobType;
}

function OperationsTab() {
  const { data: jobsData, isLoading } = useQuery<{ jobs: Job[] }>({
    queryKey: ["/api/jobs/recent"],
    refetchInterval: 5000,
  });

  const jobs = jobsData?.jobs || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Estado del Worker
          </CardTitle>
          <CardDescription>
            El worker de tareas se ejecuta cada 5 segundos buscando trabajos pendientes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm">Worker activo</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trabajos Recientes</CardTitle>
          <CardDescription>
            Últimos trabajos procesados por el sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-jobs">
              No hay trabajos registrados
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="p-4 border rounded-md"
                  data-testid={`row-job-${job.id}`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-medium" data-testid={`text-job-type-${job.id}`}>
                        {getJobTypeLabel(job.jobType)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Creado: {format(new Date(job.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Intentos: {job.attempts}/{job.maxAttempts}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getJobStatusBadge(job.status)}
                    </div>
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

function DocumentationTab() {
  const { toast } = useToast();
  
  const { data: docsData, isLoading } = useQuery<SystemDoc[]>({
    queryKey: ["/api/system/docs"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/system/docs/run");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Generación iniciada",
        description: "La documentación se está generando en segundo plano",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/system/docs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/recent"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al generar documentación",
        variant: "destructive",
      });
    },
  });

  const docs = docsData || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documentación del Sistema
            </CardTitle>
            <CardDescription>
              Documentación generada automáticamente sobre el sistema
            </CardDescription>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-docs"
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Generar Documentación
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-docs">
              No hay documentación generada. Haz clic en "Generar Documentación" para crear.
            </div>
          ) : (
            <div className="space-y-3">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 border rounded-md"
                  data-testid={`row-doc-${doc.id}`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium" data-testid={`text-doc-title-${doc.id}`}>
                        {doc.title}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Tipo: {doc.docType}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Generado: {format(new Date(doc.generatedAt), "dd MMM yyyy, HH:mm", { locale: es })}
                      </div>
                    </div>
                    <Badge variant="secondary">{doc.docType}</Badge>
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

function AgentsTab() {
  const { toast } = useToast();
  
  const { data: agentsData, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: healthData, isLoading: healthLoading } = useQuery<AgentHealth>({
    queryKey: ["/api/agents/health"],
    refetchInterval: 30000,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agents/seed");
      return res.json();
    },
    onSuccess: (data: { created: string[]; skipped: string[] }) => {
      toast({
        title: "Agentes inicializados",
        description: `Creados: ${data.created.length}, Omitidos: ${data.skipped.length}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/health"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al inicializar agentes",
        variant: "destructive",
      });
    },
  });

  const smokeTestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agents/smoke-test");
      return res.json();
    },
    onSuccess: (data: SmokeTestResult) => {
      const statusLabel = data.status === "SUCCEEDED" ? "exitoso" : 
                          data.status === "BLOCKED" ? "bloqueado" : 
                          data.status === "FAILED" ? "fallido" : data.status;
      toast({
        title: `Smoke Test ${statusLabel}`,
        description: `Run ID: ${data.runId} | Duración: ${data.duration}ms | Iniciativa: ${data.initiativeName}`,
        variant: data.status === "SUCCEEDED" ? "default" : "destructive",
      });
    },
    onError: (error) => {
      toast({
        title: "Error en Smoke Test",
        description: error instanceof Error ? error.message : "Error al ejecutar smoke test",
        variant: "destructive",
      });
    },
  });

  const agents = agentsData || [];

  const getHealthBadge = (overall: string) => {
    switch (overall) {
      case "healthy":
        return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" />Saludable</Badge>;
      case "degraded":
        return <Badge variant="secondary" className="gap-1 bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"><AlertTriangle className="h-3 w-3" />Degradado</Badge>;
      case "unhealthy":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />No Saludable</Badge>;
      default:
        return <Badge variant="outline">{overall}</Badge>;
    }
  };

  const getKeyIndicator = (configured: boolean) => {
    return configured ? (
      <div className="h-3 w-3 rounded-full bg-green-500" title="Configurada" />
    ) : (
      <div className="h-3 w-3 rounded-full bg-red-500" title="No configurada" />
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Estado de Salud del Sistema
            </CardTitle>
            <CardDescription>
              Estado de las claves API y disponibilidad de agentes
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {healthData && getHealthBadge(healthData.overall)}
          </div>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : healthData ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2" data-testid="status-openai">
                  {getKeyIndicator(healthData.keys.openai.configured)}
                  <span className="text-sm">{healthData.keys.openai.name}</span>
                </div>
                <div className="flex items-center gap-2" data-testid="status-anthropic">
                  {getKeyIndicator(healthData.keys.anthropic.configured)}
                  <span className="text-sm">{healthData.keys.anthropic.name}</span>
                </div>
                <div className="flex items-center gap-2" data-testid="status-google">
                  {getKeyIndicator(healthData.keys.google.configured)}
                  <span className="text-sm">{healthData.keys.google.name}</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 pt-2 border-t">
                <div className="text-sm text-muted-foreground">
                  Agentes habilitados: {healthData.enabledCount} / {healthData.totalCount}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => smokeTestMutation.mutate()}
                  disabled={smokeTestMutation.isPending}
                  data-testid="button-smoke-test"
                >
                  {smokeTestMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Smoke Test
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground" data-testid="text-no-health">
              No se pudo obtener el estado de salud
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Flota de Agentes
            </CardTitle>
            <CardDescription>
              Agentes AI disponibles para análisis y generación de contenido
            </CardDescription>
          </div>
          <Button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            data-testid="button-seed-agents"
          >
            {seedMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Inicializar Agentes
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-agents">
              No hay agentes registrados. Haz clic en "Inicializar Agentes" para crear.
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="p-4 border rounded-md"
                  data-testid={`row-agent-${agent.name}`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium" data-testid={`text-agent-name-${agent.name}`}>
                        {agent.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {agent.purpose || "Sin descripción"}
                      </div>
                      {agent.activeVersion && (
                        <div className="text-xs text-muted-foreground">
                          Versión: {agent.activeVersion}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {agent.enabled ? (
                        <Badge variant="default">Habilitado</Badge>
                      ) : (
                        <Badge variant="secondary">Deshabilitado</Badge>
                      )}
                    </div>
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

export default function System() {
  useDocumentTitle("Sistema - PMO Dashboard");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">
          Sistema
        </h1>
        <p className="text-muted-foreground">
          Administración de operaciones, documentación y agentes del sistema
        </p>
      </div>

      <Tabs defaultValue="operations" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="operations" data-testid="tab-operations">
            Operaciones
          </TabsTrigger>
          <TabsTrigger value="documentation" data-testid="tab-documentation">
            Documentación
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">
            Agentes
          </TabsTrigger>
        </TabsList>
        <TabsContent value="operations" className="mt-6">
          <OperationsTab />
        </TabsContent>
        <TabsContent value="documentation" className="mt-6">
          <DocumentationTab />
        </TabsContent>
        <TabsContent value="agents" className="mt-6">
          <AgentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
