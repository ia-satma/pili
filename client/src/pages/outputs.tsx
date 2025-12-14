import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Link } from "wouter";
import {
  FileSpreadsheet,
  Users,
  AlertTriangle,
  Mail,
  FileText,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Play,
  AlertCircle,
  Bot,
  Download,
  Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface JobSummary {
  lastSuccess: {
    id: number;
    completedAt: string;
    output: Record<string, unknown> | null;
  } | null;
  hasPending: boolean;
}

interface OutputsSummary {
  summary: Record<string, JobSummary>;
  queueStats: {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
  };
  failedJobs: Array<{
    id: number;
    jobType: string;
    status: string;
    errorCode: string | null;
    lastError: string | null;
    requestId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  artifacts: {
    export: {
      id: number;
      fileName: string;
      fileSize: number;
      createdAt: string;
      downloadUrl: string;
    } | null;
    packet: {
      id: number;
      status: string;
      createdAt: string;
      initiativeCount: number;
      viewUrl: string;
    } | null;
    docs: {
      id: number;
      docType: string;
      createdAt: string;
    } | null;
  };
  counts: {
    openAlerts: number;
    chaserDrafts: number;
  };
}

const jobTypeConfig: Record<string, { label: string; icon: typeof FileSpreadsheet; description: string }> = {
  GENERATE_EXPORT_EXCEL: {
    label: "Exportar Excel",
    icon: FileSpreadsheet,
    description: "Genera archivo Excel con todas las iniciativas",
  },
  GENERATE_COMMITTEE_PACKET: {
    label: "Paquete Comité",
    icon: Users,
    description: "Genera el paquete de reportes para comité",
  },
  DETECT_LIMBO: {
    label: "Detectar Limbo",
    icon: AlertTriangle,
    description: "Detecta iniciativas estancadas o zombi",
  },
  DRAFT_CHASERS: {
    label: "Generar Chasers",
    icon: Mail,
    description: "Genera borradores de correos de seguimiento",
  },
  GENERATE_SYSTEM_DOCS: {
    label: "Documentación Sistema",
    icon: FileText,
    description: "Genera documentación del sistema (1x/día)",
  },
};

export default function Outputs() {
  useDocumentTitle("Torre de Control - Outputs");
  const { toast } = useToast();

  const { data, isLoading, refetch, isRefetching } = useQuery<OutputsSummary>({
    queryKey: ["/api/outputs/summary"],
    refetchInterval: 30000,
  });

  const rerunMutation = useMutation({
    mutationFn: async (jobType: string) => {
      const res = await apiRequest("POST", `/api/outputs/rerun/${jobType}`);
      return res.json();
    },
    onSuccess: (data, jobType) => {
      toast({
        title: "Job Encolado",
        description: `${jobTypeConfig[jobType]?.label || jobType} se ha encolado exitosamente`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/outputs/summary"] });
    },
    onError: (error: Error, jobType) => {
      toast({
        title: "Error",
        description: error.message || `Error al encolar ${jobType}`,
        variant: "destructive",
      });
    },
  });

  const handleRerun = (jobType: string) => {
    rerunMutation.mutate(jobType);
  };

  interface BriefResult {
    initiativeId: number;
    title: string;
    runId: number;
    status: string;
    output: Record<string, unknown> | null;
    blockedReason?: string;
  }

  interface BriefResponse {
    success: boolean;
    results: BriefResult[];
    hasBlocked: boolean;
  }

  const [briefResults, setBriefResults] = useState<BriefResponse | null>(null);

  const briefMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agent/brief");
      return res.json() as Promise<BriefResponse>;
    },
    onSuccess: (data) => {
      setBriefResults(data);
      if (data.hasBlocked) {
        toast({
          title: "Agente Bloqueado",
          description: "Algunas revisiones del Council están bloqueadas. Verifica la configuración de API keys.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Brief IA Generado",
          description: `Se generaron ${data.results.length} briefs exitosamente`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Error al ejecutar brief IA",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const summary = data?.summary || {};
  const queueStats = data?.queueStats || { queued: 0, running: 0, succeeded: 0, failed: 0 };
  const failedJobs = data?.failedJobs || [];
  const counts = data?.counts || { openAlerts: 0, chaserDrafts: 0 };
  const artifacts = data?.artifacts || { export: null, packet: null, docs: null };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
            Torre de Control
          </h1>
          <p className="text-muted-foreground mt-1">
            Estado de outputs y cola de procesamiento
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          data-testid="button-refresh-outputs"
        >
          {isRefetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Actualizar</span>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Cola</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-queued">
              {queueStats.queued}
            </div>
            <p className="text-xs text-muted-foreground">últimas 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ejecutando</CardTitle>
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-running">
              {queueStats.running}
            </div>
            <p className="text-xs text-muted-foreground">en este momento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completados</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="stat-succeeded">
              {queueStats.succeeded}
            </div>
            <p className="text-xs text-muted-foreground">últimas 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fallidos</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="stat-failed">
              {queueStats.failed}
            </div>
            <p className="text-xs text-muted-foreground">últimas 24h</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contadores Activos</CardTitle>
            <CardDescription>Estado actual de alertas y chasers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Link href="/alerts" className="flex items-center gap-2 hover:underline">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span>Alertas Abiertas</span>
              </Link>
              <Badge variant="secondary" data-testid="text-alerts-count">
                {counts.openAlerts}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <Link href="/chasers" className="flex items-center gap-2 hover:underline">
                <Mail className="h-4 w-4 text-blue-500" />
                <span>Borradores Chaser</span>
              </Link>
              <Badge variant="secondary" data-testid="text-chaser-count">
                {counts.chaserDrafts}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Artefactos Disponibles</CardTitle>
            <CardDescription>Últimos outputs generados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {artifacts.export ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-green-500" />
                  <div>
                    <span className="text-sm font-medium">{artifacts.export.fileName}</span>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(artifacts.export.fileSize)} • {formatDistanceToNow(new Date(artifacts.export.createdAt), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </div>
                <a
                  href={artifacts.export.downloadUrl}
                  download
                  data-testid="link-download-export"
                >
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-1" />
                    Descargar
                  </Button>
                </a>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                <span>Sin exportación disponible</span>
              </div>
            )}

            {artifacts.packet ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <div>
                    <span className="text-sm font-medium">Paquete Comité #{artifacts.packet.id}</span>
                    <p className="text-xs text-muted-foreground">
                      {artifacts.packet.initiativeCount} iniciativas • {formatDistanceToNow(new Date(artifacts.packet.createdAt), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </div>
                <Link href={`/committee/${artifacts.packet.id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="link-view-packet"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>Sin paquete de comité disponible</span>
              </div>
            )}

            {artifacts.docs && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-500" />
                  <div>
                    <span className="text-sm font-medium">{artifacts.docs.docType}</span>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(artifacts.docs.createdAt), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {failedJobs.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-lg text-red-600 dark:text-red-400">
              Errores Recientes
            </CardTitle>
            <CardDescription>Jobs fallidos en las últimas 24h</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-64 overflow-y-auto">
            {failedJobs.slice(0, 5).map((job) => (
              <div
                key={job.id}
                className="text-sm p-2 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
                data-testid={`failed-job-${job.id}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium">
                    {jobTypeConfig[job.jobType]?.label || job.jobType}
                  </span>
                  <Badge variant="destructive" className="text-xs">
                    {job.status}
                  </Badge>
                </div>
                {job.errorCode && (
                  <p className="text-xs text-muted-foreground">
                    Código: <code className="font-mono">{job.errorCode}</code>
                  </p>
                )}
                {job.lastError && (
                  <p className="text-xs text-red-600 dark:text-red-400 truncate">
                    {job.lastError}
                  </p>
                )}
                {job.requestId && (
                  <p className="text-xs text-muted-foreground">
                    Request ID: <code className="font-mono text-xs">{job.requestId}</code>
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4">Outputs del Sistema</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(jobTypeConfig).map(([jobType, config]) => {
            const jobData = summary[jobType];
            const Icon = config.icon;
            const lastSuccess = jobData?.lastSuccess;
            const hasPending = jobData?.hasPending;

            return (
              <Card key={jobType} data-testid={`output-card-${jobType}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{config.label}</CardTitle>
                    </div>
                    {hasPending && (
                      <Badge variant="secondary" className="text-xs">
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        En cola
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">{config.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lastSuccess ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Última ejecución exitosa</span>
                      </div>
                      <p className="text-xs text-muted-foreground" data-testid={`last-success-${jobType}`}>
                        {formatDistanceToNow(new Date(lastSuccess.completedAt), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </p>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Sin ejecuciones exitosas
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleRerun(jobType)}
                    disabled={hasPending || rerunMutation.isPending}
                    data-testid={`button-rerun-${jobType}`}
                  >
                    {rerunMutation.isPending && rerunMutation.variables === jobType ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    {hasPending ? "En proceso..." : "Ejecutar Ahora"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Agentes IA</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card data-testid="output-card-ai-brief">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Generar Brief IA</CardTitle>
                </div>
                {briefMutation.isPending && (
                  <Badge variant="secondary" className="text-xs">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Ejecutando
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                Ejecuta CommitteeBriefAgent sobre las top 3 iniciativas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {briefResults && (
                <div className="space-y-2">
                  {briefResults.hasBlocked ? (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="text-sm">Agente Bloqueado</AlertTitle>
                      <AlertDescription className="text-xs">
                        {briefResults.results.find(r => r.blockedReason)?.blockedReason || 
                          "Council reviewers están bloqueados - verifica configuración de API keys"}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Brief generado exitosamente</span>
                      </div>
                      <p className="text-xs text-muted-foreground" data-testid="brief-result-count">
                        {briefResults.results.length} iniciativas procesadas
                      </p>
                    </div>
                  )}
                  <div className="space-y-1">
                    {briefResults.results.map((result) => (
                      <div 
                        key={result.runId} 
                        className="text-xs p-2 rounded-md bg-muted"
                        data-testid={`brief-result-${result.initiativeId}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{result.title}</span>
                          <Badge 
                            variant={result.status === "SUCCEEDED" ? "secondary" : "destructive"} 
                            className="text-xs"
                          >
                            {result.status}
                          </Badge>
                        </div>
                        {result.blockedReason && (
                          <p className="text-red-600 dark:text-red-400 mt-1">
                            {result.blockedReason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => briefMutation.mutate()}
                disabled={briefMutation.isPending}
                data-testid="button-generate-ai-brief"
              >
                {briefMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Bot className="h-4 w-4 mr-2" />
                )}
                {briefMutation.isPending ? "Generando..." : "Generar Brief IA para el último packet"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
