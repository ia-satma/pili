import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  FolderOpen,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Activity,
  CalendarX2,
  Trash2,
  Loader2,
  ShieldCheck,
  Gem,
  Skull,
  Target,
  Search,
  Sparkles,
  Zap,
  AlertCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard, KpiCardSkeleton } from "@/components/kpi-card";
import { TrafficLight, calculateTrafficLight } from "@/components/traffic-light";
import { FilterBar } from "@/components/filter-bar";
import { HealthBar } from "@/components/health-bar";
import { ChaserModal } from "@/components/chaser-modal";
import { useFilters } from "@/contexts/filter-context";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  ReferenceArea,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import type { Project } from "@shared/schema";

interface OverdueProject {
  id: number;
  projectName: string;
  endDateEstimated: string | null;
  status: string | null;
  departmentName: string | null;
  daysOverdue: number;
}

interface ApproachingProject {
  id: number;
  projectName: string;
  endDateEstimated: string | null;
  daysRemaining: number;
  departmentName: string | null;
}

interface StaleProject {
  id: number;
  projectName: string;
  lastUpdated: string | null;
  daysSinceUpdate: number;
  departmentName: string | null;
}

interface ScoringProject {
  id: number;
  projectName: string;
  departmentName: string | null;
  totalValor: number;
  totalEsfuerzo: number;
  puntajeTotal: number | null;
  ranking: number | null;
  status: string | null;
}

interface ScoringMatrixData {
  projects: ScoringProject[];
  medianValor: number;
  medianEsfuerzo: number;
  quadrants: {
    quickWins: number;
    bigBets: number;
    fillIns: number;
    moneyPit: number;
  };
  total: number;
}
interface DashboardData {
  totalProjects: number;
  openProjects: number;
  closedProjects: number;
  overdueProjects: number;
  projectsByDepartment: { name: string; count: number }[];
  projectsByStatus: { name: string; count: number }[];
  recentUpdates: Project[];
  trafficLightSummary: { green: number; yellow: number; red: number; gray: number };
  overdueProjectsList: OverdueProject[];
  approachingDeadlineList: ApproachingProject[];
  staleProjectsList: StaleProject[];
  dataQualityGaps: {
    missingEndDateCount: number;
    missingPowerSteeringIdCount: number;
    missingFinancialBenefitCount: number;
  };
}

interface HealthStats {
  totalProjects: number;
  cleanProjects: number;
  dirtyProjects: number;
  averageScore: number;
}

interface PortfolioInsight {
  id: number;
  projectName: string;
  departmentName: string | null;
  capexTier: string | null;
  financialImpact: string | null;
  strategicFit: string | null;
  status: string | null;
  reason: string;
}

interface PortfolioInsightsData {
  quickWins: PortfolioInsight[];
  zombiesToKill: PortfolioInsight[];
  strategicMisalignment: PortfolioInsight[];
  valueBets: PortfolioInsight[];
  summary: {
    totalAnalyzed: number;
    quickWinsCount: number;
    zombiesCount: number;
    misalignedCount: number;
    valueBetsCount: number;
    portfolioHealthScore: number;
  };
  generatedAt: string;
}

const CHART_COLORS = [
  "hsl(217, 91%, 48%)",  // primary blue
  "hsl(142, 71%, 35%)",  // green
  "hsl(262, 52%, 42%)",  // purple
  "hsl(32, 95%, 48%)",   // orange
  "hsl(340, 82%, 45%)",  // pink
];

const TRAFFIC_COLORS = {
  green: "hsl(142, 76%, 36%)",
  yellow: "hsl(45, 93%, 47%)",
  red: "hsl(0, 84%, 60%)",
  gray: "hsl(220, 9%, 46%)",
};

const QUADRANT_COLORS = {
  quickWins: "hsl(142, 76%, 36%)",  // Green
  bigBets: "hsl(217, 91%, 48%)",     // Blue
  fillIns: "hsl(45, 93%, 47%)",      // Yellow
  moneyPit: "hsl(0, 84%, 60%)",      // Red
};

function parseScore(val: any): number | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  // Removed 1-25 clamping to support user's full scale (0-1000+)
  return num;
}

function calculateMedian(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

// Status to DMAIC mapping removed to ensure data fidelity with source Excel

function QuadrantCard({ title, subtitle, projects, borderColor, headerBg, icon, setLocation }: any) {
  return (
    <div className={`flex flex-col h-[350px] rounded-lg border-2 ${borderColor} overflow-hidden bg-card shadow-sm`}>
      <div className={`px-4 py-3 ${headerBg} border-b flex items-center justify-between`}>
        <div>
          <h4 className="text-sm font-bold flex items-center gap-2">
            {icon}
            {title}
          </h4>
          <p className="text-[10px] text-muted-foreground font-medium">{subtitle}</p>
        </div>
        <Badge variant="outline" className="bg-white/50 text-[10px] py-0 h-5">
          {projects.length}
        </Badge>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {projects.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-[11px] italic">
            No hay proyectos en esta categoría
          </div>
        ) : (
          <div className="space-y-1">
            {projects.map((project: any) => (
              <div
                key={project.id}
                onClick={() => {
                  console.log("Navigating to project:", project.id);
                  setLocation(`/project/${project.id}`);
                }}
                className="group p-2 rounded hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                    {project.projectName}
                  </p>
                  <span className="text-[10px] font-bold text-primary shrink-0">
                    V:{project.totalValor}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] truncate max-w-[120px]">
                    {project.status || "Sin Dueño"}
                  </p>
                  <p className="text-[10px]">E:{project.totalEsfuerzo}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  useDocumentTitle("Dashboard");
  const [, setLocation] = useLocation();
  const { buildQueryString, hasActiveFilters } = useFilters();
  const queryString = buildQueryString();
  const { toast } = useToast();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard", queryString],
    queryFn: () => fetch(`/api/dashboard${queryString ? `?${queryString}` : ""}`).then(r => r.json()),
  });

  const { data: scoringData, isLoading: scoringLoading } = useQuery<ScoringMatrixData>({
    queryKey: ["/api/scoring/matrix", queryString],
    queryFn: () => fetch(`/api/scoring/matrix${queryString ? `?${queryString}` : ""}`).then(r => r.json()),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/nuke-database", { method: "DELETE" });
      if (!response.ok) throw new Error("Error al borrar datos");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Base de datos reiniciada",
        description: "Todos los proyectos han sido eliminados.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/health/stats"] });
      setResetDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    },
  });

  const auditMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/projects/audit-batch", { method: "POST" });
      if (!response.ok) throw new Error("Error al ejecutar auditoría");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Auditoría de Calidad Completada",
        description: `${data.audited} proyectos auditados. Sólidos: ${data.healthy}, Revisar: ${data.warning}, Críticos: ${data.critical}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/health/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al ejecutar auditoría",
        variant: "destructive",
      });
    },
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Error al cargar el dashboard
      </div>
    );
  }

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "—";
    try {
      let dateObj: Date;
      if (date instanceof Date) {
        dateObj = date;
      } else {
        // Add T12:00:00 to avoid timezone issues with date-only strings
        const dateStr = date.includes("T") ? date : `${date}T12:00:00`;
        dateObj = new Date(dateStr);
      }
      return format(dateObj, "dd MMM yyyy", { locale: es });
    } catch {
      return typeof date === 'string' ? date : "—";
    }
  };

  return (
    <div className="space-y-8 p-6">
      {/* Page Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tablero de Control</h1>
            <p className="text-muted-foreground">
              Vista general de proyectos de mejora continua
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => auditMutation.mutate()}
              disabled={auditMutation.isPending}
              data-testid="button-run-pmo-audit"
            >
              {auditMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              AUDITAR CALIDAD
            </Button>
            <ChaserModal />
            <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" data-testid="button-reset-database">
                  <Trash2 className="mr-2 h-4 w-4" />
                  BORRAR TODO (RESET)
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>BORRAR TODOS LOS PROYECTOS</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará TODOS los proyectos de la base de datos.
                    Esta operación NO se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-reset">Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={resetMutation.isPending}
                    data-testid="button-confirm-reset"
                  >
                    {resetMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Borrando...
                      </>
                    ) : (
                      "Sí, BORRAR TODO"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <HealthBar />
        <FilterBar />
        {hasActiveFilters && (
          <p className="text-sm text-muted-foreground">
            Mostrando datos filtrados
          </p>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              title="Total Proyectos"
              value={data?.totalProjects || 0}
              subtitle="Registrados en el sistema"
              icon={FolderOpen}
            />
            <KpiCard
              title="Proyectos Abiertos"
              value={data?.openProjects || 0}
              subtitle="En proceso activo"
              icon={Activity}
            />
            <KpiCard
              title="Proyectos Cerrados"
              value={data?.closedProjects || 0}
              subtitle="Completados exitosamente"
              icon={CheckCircle2}
            />
            <KpiCard
              title="Proyectos Vencidos"
              value={data?.overdueProjects || 0}
              subtitle="Requieren atención"
              icon={AlertTriangle}
              className={data?.overdueProjects && data.overdueProjects > 0 ? "border-traffic-red/50" : ""}
            />
          </>
        )}
      </div>

      {/* Data Hygiene & Prioritization Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Data Quality Gaps Card */}
        <Card className="overflow-visible border-blue-500/30 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Higiene de Datos (Crítico)
            </CardTitle>
            <p className="text-xs text-muted-foreground">Brechas de datos internos para corregir en Excel</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-6 pt-2">
                <div className="flex items-center justify-between p-4 rounded-lg bg-background border border-blue-100 hover-elevate">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-red-100">
                      <CalendarX2 className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Falta Fecha Fin</p>
                      <p className="text-xs text-muted-foreground">Impacta pronósticos de tiempo</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-lg font-bold bg-white text-red-600 border-red-200">
                    {data?.dataQualityGaps?.missingEndDateCount || 0}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-background border border-blue-100 hover-elevate">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-orange-100">
                      <Target className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Falta ID Power Steering</p>
                      <p className="text-xs text-muted-foreground">Brechas en rastreo global</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-lg font-bold bg-white text-orange-600 border-orange-200">
                    {data?.dataQualityGaps?.missingPowerSteeringIdCount || 0}
                  </Badge>
                </div>

              </div>
            )}
          </CardContent>
        </Card>

        {/* Value/Effort Matrix - Scatter Plot */}
        <Card className="lg:col-span-2 overflow-visible">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Matriz de Decisiones
                </CardTitle>
                <p className="text-xs text-muted-foreground">Basado en Valor Total vs Esfuerzo Total (Solo Datos Excel)</p>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                Total Proyectos: {scoringData?.projects?.length || 0}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {scoringLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : !scoringData || !scoringData.projects || scoringData.projects.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-lg">
                <p className="font-medium">No hay datos de scoring disponibles</p>
                <p className="text-xs mt-1">Cargue un archivo Excel con columnas de "Total Valor" y "Total Esfuerzo"</p>
              </div>
            ) : (() => {
              const projects = scoringData.projects || [];

              // 1. Separate valid projects (with scores) from "Limbo" projects
              const validProjects = projects.filter((p: any) =>
                p.totalValor !== null && p.totalValor !== undefined &&
                p.totalEsfuerzo !== null && p.totalEsfuerzo !== undefined
              );

              const limboProjects = projects.filter((p: any) =>
                p.totalValor === null || p.totalValor === undefined ||
                p.totalEsfuerzo === null || p.totalEsfuerzo === undefined
              );

              // 2. Calculate Median from VALID projects only
              const medianValue = calculateMedian(validProjects.map((p: any) => p.totalValor));
              const medianEffort = calculateMedian(validProjects.map((p: any) => p.totalEsfuerzo));

              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* TOP-LEFT: QUICK WINS (High Value, Low Effort) */}
                    <QuadrantCard
                      title="💎 Ganancias Rápidas (Alto Valor / Bajo Esfuerzo)"
                      subtitle={`Valor ≥ ${medianValue.toFixed(1)}, Esfuerzo < ${medianEffort.toFixed(1)}`}
                      icon={<Sparkles className="h-4 w-4 text-green-500" />}
                      borderColor="border-green-200"
                      headerBg="bg-green-50"
                      projects={validProjects
                        .filter((p: any) => p.totalValor >= medianValue && p.totalEsfuerzo < medianEffort)
                        .sort((a: any, b: any) => b.totalValor - a.totalValor)}
                      setLocation={setLocation}
                    />

                    {/* TOP-RIGHT: ESTRATÉGICOS (High Value, High Effort) */}
                    <QuadrantCard
                      title="🚀 Proyectos Estratégicos (Alto Valor / Alto Esfuerzo)"
                      subtitle={`Valor ≥ ${medianValue.toFixed(1)}, Esfuerzo ≥ ${medianEffort.toFixed(1)}`}
                      icon={<Zap className="h-4 w-4 text-yellow-500" />}
                      borderColor="border-yellow-200"
                      headerBg="bg-yellow-50"
                      projects={validProjects
                        .filter((p: any) => p.totalValor >= medianValue && p.totalEsfuerzo >= medianEffort)
                        .sort((a: any, b: any) => b.totalValor - a.totalValor)}
                      setLocation={setLocation}
                    />

                    {/* BOTTOM-LEFT: BAJA PRIORIDAD (Low Value, Low Effort) */}
                    <QuadrantCard
                      title="💤 Baja Prioridad (Bajo Valor / Bajo Esfuerzo)"
                      subtitle={`Valor < ${medianValue.toFixed(1)}, Esfuerzo < ${medianEffort.toFixed(1)}`}
                      icon={<Clock className="h-4 w-4 text-gray-400" />}
                      borderColor="border-gray-200"
                      headerBg="bg-gray-50"
                      projects={validProjects
                        .filter((p: any) => p.totalValor < medianValue && p.totalEsfuerzo < medianEffort)
                        .sort((a: any, b: any) => b.totalValor - a.totalValor)}
                      setLocation={setLocation}
                    />

                    {/* BOTTOM-RIGHT: DESPERDICIO (Low Value, High Effort) */}
                    <QuadrantCard
                      title="💀 Descarte / Revisión (Bajo Valor / Alto Esfuerzo)"
                      subtitle={`Valor < ${medianValue.toFixed(1)}, Esfuerzo ≥ ${medianEffort.toFixed(1)}`}
                      icon={<AlertCircle className="h-4 w-4 text-red-500" />}
                      borderColor="border-red-200"
                      headerBg="bg-red-50"
                      projects={validProjects
                        .filter((p: any) => p.totalValor < medianValue && p.totalEsfuerzo >= medianEffort)
                        .sort((a: any, b: any) => b.totalValor - a.totalValor)}
                      setLocation={setLocation}
                    />
                  </div>

                  {/* SAFETY NET: Limbo Projects */}
                  {limboProjects.length > 0 && (
                    <div className="rounded-lg border-2 border-red-100 bg-red-50/50 p-4 animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <h4 className="text-sm font-bold text-red-900 leading-none">
                          ⚠️ Sin Clasificar / Datos Faltantes ({limboProjects.length})
                        </h4>
                      </div>
                      <p className="text-xs text-red-700 mb-3 opacity-90">
                        Estos proyectos no tienen puntaje de "Valor" o "Esfuerzo" y no aparecen en la matriz.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2">
                        {limboProjects.map((project: any) => (
                          <div
                            key={project.id}
                            className="flex items-center justify-between p-2.5 bg-white/80 rounded-md text-xs hover:bg-white cursor-pointer border border-red-100 transition-colors shadow-sm"
                            onClick={() => setLocation(`/project/${project.id}`)}
                          >
                            <span className="font-medium truncate mr-2 text-foreground/80">{project.projectName}</span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap font-mono bg-red-50 px-1.5 py-0.5 rounded">
                              V: {project.totalValor ?? '-'} | E: {project.totalEsfuerzo ?? '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Projects by Department */}
        <Card className="lg:col-span-3 overflow-visible">
          <CardHeader>
            <CardTitle className="text-base">Proyectos por Departamento</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={data?.projectsByDepartment || []}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    width={75}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(217, 91%, 48%)"
                    radius={[0, 4, 4, 0]}
                    name="Proyectos"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution - Project Lifecycle Status (from 'status' field) */}
        <Card className="lg:col-span-2 overflow-visible">
          <CardHeader>
            <CardTitle className="text-base">Estado del Proyecto</CardTitle>
            <p className="text-xs text-muted-foreground">Ciclo de vida: Terminado, On going, Proyecto nuevo</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={(data?.projectsByStatus || []).map((item, index) => ({
                        name: item.name,
                        value: item.count,
                        fill: CHART_COLORS[index % CHART_COLORS.length],
                      }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {(data?.projectsByStatus || []).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => <span className="text-sm">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* DMAIC Methodology Breakdown removed for data fidelity - Row 4 doesn't support these phases natively */}


      {/* Recent Updates - Full Width */}
      <div className="grid grid-cols-1 gap-6">
        {/* Recent Updates */}
        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle className="text-base">Actualizaciones Recientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (data?.recentUpdates || []).length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                No hay actualizaciones recientes
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(data?.recentUpdates || []).slice(0, 5).map((project) => {
                  const trafficLight = calculateTrafficLight(
                    project.endDateEstimated,
                    project.endDateEstimatedTbd,
                    project.status,
                    project.estatusAlDia
                  );

                  return (
                    <div
                      key={project.id}
                      className="p-4 flex items-center justify-between gap-4 hover-elevate"
                      data-testid={`recent-project-${project.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <TrafficLight status={trafficLight} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{project.projectName}</p>
                          <p className="text-xs text-muted-foreground">
                            {project.departmentName || "Sin departamento"} · {project.responsible || "Sin responsable"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {project.status && (
                          <Badge variant="secondary" className="text-xs">
                            {project.status}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(project.updatedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System Alerts Section */}
      <Card className="overflow-visible" data-testid="alerts-section">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-traffic-yellow" />
            Alertas del Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Tabs defaultValue="overdue" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overdue" data-testid="tab-overdue" className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="hidden sm:inline">Proyectos Vencidos</span>
                  <span className="sm:hidden">Vencidos</span>
                  {(data?.overdueProjectsList?.length || 0) > 0 && (
                    <Badge variant="secondary" className="ml-1 bg-traffic-red/20 text-traffic-red">
                      {data?.overdueProjectsList?.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="approaching" data-testid="tab-approaching" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="hidden sm:inline">Por Vencer</span>
                  <span className="sm:hidden">Por Vencer</span>
                  {(data?.approachingDeadlineList?.length || 0) > 0 && (
                    <Badge variant="secondary" className="ml-1 bg-traffic-yellow/20 text-traffic-yellow">
                      {data?.approachingDeadlineList?.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="stale" data-testid="tab-stale" className="flex items-center gap-2">
                  <CalendarX2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Sin Actualizar</span>
                  <span className="sm:hidden">Sin Actualizar</span>
                  {(data?.staleProjectsList?.length || 0) > 0 && (
                    <Badge variant="secondary" className="ml-1 bg-traffic-gray/20 text-traffic-gray">
                      {data?.staleProjectsList?.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Overdue Projects Tab */}
              <TabsContent value="overdue" data-testid="alert-list-overdue" className="mt-4">
                {(data?.overdueProjectsList?.length || 0) === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No hay alertas en esta categoría
                  </div>
                ) : (
                  <div className="divide-y divide-border rounded-md border">
                    {data?.overdueProjectsList?.map((project, index) => (
                      <motion.div
                        key={project.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Link
                          href={`/project/${project.id}`}
                          className="flex items-center justify-between gap-4 p-4 hover-elevate cursor-pointer"
                          data-testid={`alert-overdue-${project.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-3 w-3 rounded-full bg-traffic-red flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{project.projectName}</p>
                              <p className="text-xs text-muted-foreground">
                                {project.departmentName || "Sin departamento"} · Fecha estimada: {formatDate(project.endDateEstimated)}
                              </p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-traffic-red/10 text-traffic-red border-traffic-red/30 flex-shrink-0">
                            {project.daysOverdue} {project.daysOverdue === 1 ? "día" : "días"} vencido
                          </Badge>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Approaching Deadline Tab */}
              <TabsContent value="approaching" data-testid="alert-list-approaching" className="mt-4">
                {(data?.approachingDeadlineList?.length || 0) === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No hay alertas en esta categoría
                  </div>
                ) : (
                  <div className="divide-y divide-border rounded-md border">
                    {data?.approachingDeadlineList?.map((project, index) => (
                      <motion.div
                        key={project.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Link
                          href={`/project/${project.id}`}
                          className="flex items-center justify-between gap-4 p-4 hover-elevate cursor-pointer"
                          data-testid={`alert-approaching-${project.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-3 w-3 rounded-full bg-traffic-yellow flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{project.projectName}</p>
                              <p className="text-xs text-muted-foreground">
                                {project.departmentName || "Sin departamento"} · Fecha estimada: {formatDate(project.endDateEstimated)}
                              </p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-traffic-yellow/10 text-traffic-yellow border-traffic-yellow/30 flex-shrink-0">
                            {project.daysRemaining} {project.daysRemaining === 1 ? "día" : "días"} restantes
                          </Badge>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Stale Projects Tab */}
              <TabsContent value="stale" data-testid="alert-list-stale" className="mt-4">
                {(data?.staleProjectsList?.length || 0) === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No hay alertas en esta categoría
                  </div>
                ) : (
                  <div className="divide-y divide-border rounded-md border">
                    {data?.staleProjectsList?.map((project, index) => (
                      <motion.div
                        key={project.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Link
                          href={`/project/${project.id}`}
                          className="flex items-center justify-between gap-4 p-4 hover-elevate cursor-pointer"
                          data-testid={`alert-stale-${project.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-3 w-3 rounded-full bg-traffic-gray flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{project.projectName}</p>
                              <p className="text-xs text-muted-foreground">
                                {project.departmentName || "Sin departamento"} · Última actualización: {formatDate(project.lastUpdated)}
                              </p>
                            </div>
                          </div>
                          {/* @ts-ignore: Variant typing issue with cva */}
                          <Badge variant="secondary" className="bg-traffic-gray/10 text-traffic-gray border-traffic-gray/30 flex-shrink-0">
                            {project.daysSinceUpdate} {project.daysSinceUpdate === 1 ? "día" : "días"} sin actualizar
                          </Badge>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div >
  );
}
