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
} from "lucide-react";
import { Link } from "wouter";
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
}

interface HealthStats {
  totalProjects: number;
  cleanProjects: number;
  dirtyProjects: number;
  averageScore: number;
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

const DMAIC_COLORS = {
  define: "hsl(217, 91%, 48%)",     // Blue
  measure: "hsl(262, 52%, 52%)",    // Purple
  analyze: "hsl(32, 95%, 48%)",     // Orange
  improve: "hsl(142, 71%, 35%)",    // Green
  control: "hsl(340, 82%, 45%)",    // Pink
};

function mapStatusesToDMAIC(statusData: { name: string; count: number }[]): { phase: string; count: number; color: string }[] {
  const excludedStatuses = new Set(["cancelado", "cancelled", "canceled"]);
  
  const dmaicMap: Record<string, { phase: string; color: string }> = {
    "nuevo": { phase: "Define", color: DMAIC_COLORS.define },
    "proyecto nuevo": { phase: "Define", color: DMAIC_COLORS.define },
    "new": { phase: "Define", color: DMAIC_COLORS.define },
    "abierto": { phase: "Define", color: DMAIC_COLORS.define },
    "sin estado": { phase: "Define", color: DMAIC_COLORS.define },
    
    "análisis": { phase: "Measure", color: DMAIC_COLORS.measure },
    "analisis": { phase: "Measure", color: DMAIC_COLORS.measure },
    "medición": { phase: "Measure", color: DMAIC_COLORS.measure },
    
    "pruebas": { phase: "Analyze", color: DMAIC_COLORS.analyze },
    "testing": { phase: "Analyze", color: DMAIC_COLORS.analyze },
    "evaluación": { phase: "Analyze", color: DMAIC_COLORS.analyze },
    
    "desarrollo": { phase: "Improve", color: DMAIC_COLORS.improve },
    "implementación": { phase: "Improve", color: DMAIC_COLORS.improve },
    "implementacion": { phase: "Improve", color: DMAIC_COLORS.improve },
    "on going": { phase: "Improve", color: DMAIC_COLORS.improve },
    "en progreso": { phase: "Improve", color: DMAIC_COLORS.improve },
    
    "terminado": { phase: "Control", color: DMAIC_COLORS.control },
    "cerrado": { phase: "Control", color: DMAIC_COLORS.control },
    "completado": { phase: "Control", color: DMAIC_COLORS.control },
    "closed": { phase: "Control", color: DMAIC_COLORS.control },
  };
  
  const phaseCounts: Record<string, { count: number; color: string }> = {
    "Define": { count: 0, color: DMAIC_COLORS.define },
    "Measure": { count: 0, color: DMAIC_COLORS.measure },
    "Analyze": { count: 0, color: DMAIC_COLORS.analyze },
    "Improve": { count: 0, color: DMAIC_COLORS.improve },
    "Control": { count: 0, color: DMAIC_COLORS.control },
  };
  
  statusData.forEach((item) => {
    const normalized = item.name.toLowerCase().trim();
    if (excludedStatuses.has(normalized)) {
      return;
    }
    const mapping = dmaicMap[normalized];
    if (mapping) {
      phaseCounts[mapping.phase].count += item.count;
    }
  });
  
  return Object.entries(phaseCounts).map(([phase, data]) => ({
    phase,
    count: data.count,
    color: data.color,
  }));
}

export default function Dashboard() {
  useDocumentTitle("Dashboard");
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

  const { data: healthStats, isLoading: healthLoading } = useQuery<HealthStats>({
    queryKey: ["/api/health/stats"],
    refetchInterval: 30000,
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
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Vista general de proyectos de mejora continua
            </p>
          </div>
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

      {/* Quality Pulse & Stagnation Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quality Pulse Gauge */}
        <Card className="overflow-visible" data-testid="quality-pulse-widget">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Pulso de Calidad
            </CardTitle>
            <p className="text-xs text-muted-foreground">Salud promedio de datos del portafolio</p>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="flex flex-col items-center" data-testid="gauge-quality-pulse">
                <div className="relative w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart
                      cx="50%"
                      cy="50%"
                      innerRadius="60%"
                      outerRadius="100%"
                      barSize={16}
                      data={[{
                        name: "Salud",
                        value: healthStats?.averageScore || 0,
                        fill: (healthStats?.averageScore || 0) >= 90
                          ? TRAFFIC_COLORS.green
                          : (healthStats?.averageScore || 0) >= 70
                            ? TRAFFIC_COLORS.yellow
                            : TRAFFIC_COLORS.red
                      }]}
                      startAngle={180}
                      endAngle={0}
                    >
                      <PolarAngleAxis
                        type="number"
                        domain={[0, 100]}
                        angleAxisId={0}
                        tick={false}
                      />
                      <RadialBar
                        background={{ fill: "hsl(var(--muted))" }}
                        dataKey="value"
                        cornerRadius={8}
                      />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
                    <span 
                      className="text-4xl font-bold"
                      style={{
                        color: (healthStats?.averageScore || 0) >= 90
                          ? TRAFFIC_COLORS.green
                          : (healthStats?.averageScore || 0) >= 70
                            ? TRAFFIC_COLORS.yellow
                            : TRAFFIC_COLORS.red
                      }}
                      data-testid="text-health-score"
                    >
                      {healthStats?.averageScore || 0}%
                    </span>
                    <span className="text-xs text-muted-foreground">Salud Promedio</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 w-full mt-4 text-center">
                  <div>
                    <div className="text-lg font-semibold" data-testid="text-total-projects">{healthStats?.totalProjects || 0}</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-traffic-green" data-testid="text-clean-projects">{healthStats?.cleanProjects || 0}</div>
                    <div className="text-xs text-muted-foreground">Limpios</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-traffic-yellow" data-testid="text-dirty-projects">{healthStats?.dirtyProjects || 0}</div>
                    <div className="text-xs text-muted-foreground">Incompletos</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Placeholder for Stagnation Radar - Task dash-2 */}
        <Card className="lg:col-span-2 overflow-visible" data-testid="stagnation-radar-widget">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarX2 className="h-5 w-5 text-traffic-yellow" />
              Radar de Estancamiento
            </CardTitle>
            <p className="text-xs text-muted-foreground">Proyectos sin actualizar por más de 14 días</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (data?.staleProjectsList || []).length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mb-2 text-traffic-green" />
                <p className="text-sm">Todos los proyectos están actualizados</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(data?.staleProjectsList || []).slice(0, 5).map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50 hover-elevate"
                    data-testid={`stale-project-${project.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{project.projectName}</p>
                      <p className="text-xs text-muted-foreground">
                        {project.departmentName || "Sin departamento"} · {project.daysSinceUpdate} días sin actualizar
                      </p>
                    </div>
                    <Link href={`/project-master?id=${project.id}`}>
                      <Badge 
                        variant="outline" 
                        className="cursor-pointer text-xs border-traffic-yellow text-traffic-yellow hover:bg-traffic-yellow/10"
                        data-testid={`button-update-${project.id}`}
                      >
                        Actualizar
                      </Badge>
                    </Link>
                  </div>
                ))}
                {(data?.staleProjectsList || []).length > 5 && (
                  <Link href="/project-master?filter=stale">
                    <p className="text-xs text-center text-primary hover:underline cursor-pointer mt-2">
                      Ver {(data?.staleProjectsList || []).length - 5} proyectos más...
                    </p>
                  </Link>
                )}
              </div>
            )}
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

      {/* DMAIC Methodology Breakdown */}
      <Card className="overflow-visible" data-testid="chart-dmaic-breakdown">
        <CardHeader>
          <CardTitle className="text-base">Distribución por Fase DMAIC</CardTitle>
          <p className="text-xs text-muted-foreground">
            Define, Measure, Analyze, Improve, Control - Metodología Six Sigma
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            (() => {
              const dmaicData = mapStatusesToDMAIC(data?.projectsByStatus || []);
              const total = dmaicData.reduce((sum, d) => sum + d.count, 0);
              return total === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                  <p>No hay datos de metodología disponibles</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={dmaicData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="phase" 
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      allowDecimals={false}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                      formatter={(value: number) => [value, "Proyectos"]}
                    />
                    <Bar
                      dataKey="count"
                      radius={[4, 4, 0, 0]}
                      name="Proyectos"
                    >
                      {dmaicData.map((entry, index) => (
                        <Cell key={`dmaic-cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* Value/Effort Matrix - Scatter Plot */}
      <Card className="overflow-visible" data-testid="value-effort-matrix">
        <CardHeader>
          <CardTitle className="text-base">Matriz Valor/Esfuerzo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Priorización de proyectos: Quick Wins, Big Bets, Fill-Ins, Money Pit
          </p>
        </CardHeader>
        <CardContent>
          {scoringLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : !scoringData || !scoringData.projects || scoringData.projects.length === 0 ? (
            <div className="h-80 flex flex-col items-center justify-center text-muted-foreground">
              <p>No hay datos de scoring disponibles</p>
              <p className="text-xs mt-1">Cargue un archivo Excel con columnas de Total Valor y Total Esfuerzo</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: QUADRANT_COLORS.quickWins }} />
                  <span>Quick Wins ({scoringData.quadrants.quickWins})</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: QUADRANT_COLORS.bigBets }} />
                  <span>Big Bets ({scoringData.quadrants.bigBets})</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: QUADRANT_COLORS.fillIns }} />
                  <span>Fill-Ins ({scoringData.quadrants.fillIns})</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: QUADRANT_COLORS.moneyPit }} />
                  <span>Money Pit ({scoringData.quadrants.moneyPit})</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    dataKey="totalEsfuerzo" 
                    name="Esfuerzo" 
                    domain={['dataMin - 10', 'dataMax + 10']}
                    label={{ value: 'Esfuerzo (mayor = menos esfuerzo real)', position: 'bottom', offset: 20, style: { fontSize: 12 } }}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="totalValor" 
                    name="Valor" 
                    domain={['dataMin - 10', 'dataMax + 10']}
                    label={{ value: 'Valor Estratégico', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                    tick={{ fontSize: 11 }}
                  />
                  <ZAxis range={[60, 60]} />
                  <ReferenceLine 
                    x={scoringData.medianEsfuerzo} 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeDasharray="5 5"
                    strokeWidth={1}
                  />
                  <ReferenceLine 
                    y={scoringData.medianValor} 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeDasharray="5 5"
                    strokeWidth={1}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      padding: "8px 12px",
                    }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0) {
                        const project = payload[0].payload as ScoringProject;
                        const highValue = project.totalValor >= scoringData.medianValor;
                        const lowEffort = project.totalEsfuerzo >= scoringData.medianEsfuerzo;
                        let quadrant = "";
                        let color = "";
                        if (highValue && lowEffort) { quadrant = "Quick Win"; color = QUADRANT_COLORS.quickWins; }
                        else if (highValue && !lowEffort) { quadrant = "Big Bet"; color = QUADRANT_COLORS.bigBets; }
                        else if (!highValue && lowEffort) { quadrant = "Fill-In"; color = QUADRANT_COLORS.fillIns; }
                        else { quadrant = "Money Pit"; color = QUADRANT_COLORS.moneyPit; }
                        
                        return (
                          <div className="bg-card border rounded-md p-3 shadow-lg">
                            <p className="font-medium text-sm mb-1">{project.projectName}</p>
                            <p className="text-xs text-muted-foreground">{project.departmentName || "Sin departamento"}</p>
                            <div className="mt-2 space-y-1 text-xs">
                              <p>Valor: <span className="font-medium">{project.totalValor}</span></p>
                              <p>Esfuerzo: <span className="font-medium">{project.totalEsfuerzo}</span></p>
                              {project.ranking && <p>Ranking: <span className="font-medium">#{project.ranking}</span></p>}
                            </div>
                            <div className="mt-2 flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                              <span className="text-xs font-medium" style={{ color }}>{quadrant}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter 
                    name="Proyectos" 
                    data={scoringData.projects.map(p => {
                      const highValue = p.totalValor >= scoringData.medianValor;
                      const lowEffort = p.totalEsfuerzo >= scoringData.medianEsfuerzo;
                      let fill = QUADRANT_COLORS.moneyPit;
                      if (highValue && lowEffort) fill = QUADRANT_COLORS.quickWins;
                      else if (highValue && !lowEffort) fill = QUADRANT_COLORS.bigBets;
                      else if (!highValue && lowEffort) fill = QUADRANT_COLORS.fillIns;
                      return { ...p, fill };
                    })}
                    fill="#8884d8"
                  >
                    {scoringData.projects.map((entry, index) => {
                      const highValue = entry.totalValor >= scoringData.medianValor;
                      const lowEffort = entry.totalEsfuerzo >= scoringData.medianEsfuerzo;
                      let fill = QUADRANT_COLORS.moneyPit;
                      if (highValue && lowEffort) fill = QUADRANT_COLORS.quickWins;
                      else if (highValue && !lowEffort) fill = QUADRANT_COLORS.bigBets;
                      else if (!highValue && lowEffort) fill = QUADRANT_COLORS.fillIns;
                      return <Cell key={`cell-${index}`} fill={fill} />;
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <p className="text-xs text-center text-muted-foreground">
                Cuadrantes definidos por mediana de Valor ({scoringData.medianValor}) y Esfuerzo ({scoringData.medianEsfuerzo})
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
                          href={`/projects?id=${project.id}`}
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
                          href={`/projects?id=${project.id}`}
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
                          href={`/projects?id=${project.id}`}
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
    </div>
  );
}
