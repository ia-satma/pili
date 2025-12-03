import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  FolderOpen,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Activity,
  CalendarX2,
} from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard, KpiCardSkeleton } from "@/components/kpi-card";
import { TrafficLight, calculateTrafficLight } from "@/components/traffic-light";
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

export default function Dashboard() {
  useDocumentTitle("Dashboard");
  
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Vista general de proyectos de mejora continua
        </p>
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

        {/* Traffic Light Summary */}
        <Card className="lg:col-span-2 overflow-visible">
          <CardHeader>
            <CardTitle className="text-base">Estado de Proyectos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "En tiempo", value: data?.trafficLightSummary.green || 0 },
                        { name: "Próximo a vencer", value: data?.trafficLightSummary.yellow || 0 },
                        { name: "Vencido", value: data?.trafficLightSummary.red || 0 },
                        { name: "Sin fecha", value: data?.trafficLightSummary.gray || 0 },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      <Cell fill={TRAFFIC_COLORS.green} />
                      <Cell fill={TRAFFIC_COLORS.yellow} />
                      <Cell fill={TRAFFIC_COLORS.red} />
                      <Cell fill={TRAFFIC_COLORS.gray} />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-traffic-green" />
                    <span className="text-sm">En tiempo ({data?.trafficLightSummary.green || 0})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-traffic-yellow" />
                    <span className="text-sm">Próximo ({data?.trafficLightSummary.yellow || 0})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-traffic-red" />
                    <span className="text-sm">Vencido ({data?.trafficLightSummary.red || 0})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-traffic-gray" />
                    <span className="text-sm">Sin fecha ({data?.trafficLightSummary.gray || 0})</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status Distribution and Recent Updates */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Status Distribution */}
        <Card className="lg:col-span-2 overflow-visible">
          <CardHeader>
            <CardTitle className="text-base">Distribución por Estado</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-3">
                {(data?.projectsByStatus || []).map((item, index) => {
                  const total = data?.totalProjects || 1;
                  const percentage = Math.round((item.count / total) * 100);
                  
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">{item.count} ({percentage}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Updates */}
        <Card className="lg:col-span-3 overflow-visible">
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
                    project.status
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
