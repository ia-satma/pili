import { useQuery } from "@tanstack/react-query";
import {
  Download,
  TrendingUp,
  Users,
  Target,
  Calendar,
  BarChart3,
} from "lucide-react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import type { KpiValue } from "@shared/schema";

interface IndicatorsData {
  kpis: KpiValue[];
  projectsByMonth: { month: string; count: number; closed: number }[];
  projectsByCategory: { name: string; count: number }[];
  completionRate: { month: string; rate: number }[];
  avgDuration: number;
  onTimeDelivery: number;
  totalBenefits: number;
  activeProjects: number;
  successRate: number;
  isEmpty: boolean;
}

const CHART_COLORS = [
  "hsl(217, 91%, 48%)",
  "hsl(142, 71%, 35%)",
  "hsl(262, 52%, 42%)",
  "hsl(32, 95%, 48%)",
  "hsl(340, 82%, 45%)",
  "hsl(190, 80%, 42%)",
  "hsl(280, 65%, 48%)",
];

export default function Indicators() {
  useDocumentTitle("Indicadores");

  const { data, isLoading, error } = useQuery<IndicatorsData>({
    queryKey: ["/api/indicators"],
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Error al cargar los indicadores
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Indicadores</h1>
          <p className="text-muted-foreground">
            KPIs y métricas de rendimiento del PMO
          </p>
        </div>
      </div>

      {/* Empty State Message */}
      {data?.isEmpty && (
        <Card className="overflow-visible border-dashed">
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Sin datos de indicadores</h3>
            <p className="text-muted-foreground mb-4">
              Importe un archivo Excel con datos de proyectos para ver las métricas y gráficas del PMO.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-visible">
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="overflow-visible">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Entrega a Tiempo</p>
                    <p className="text-3xl font-semibold tabular-nums">
                      {data?.onTimeDelivery || 0}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-visible">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-chart-2/10 flex items-center justify-center">
                    <Calendar className="h-6 w-6 text-chart-2" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duración Promedio</p>
                    <p className="text-3xl font-semibold tabular-nums">
                      {data?.avgDuration || 0} <span className="text-lg">días</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-visible">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-chart-3/10 flex items-center justify-center">
                    <Target className="h-6 w-6 text-chart-3" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tasa de Éxito</p>
                    <p className="text-3xl font-semibold tabular-nums">
                      {data?.successRate ?? 0}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-visible">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-chart-4/10 flex items-center justify-center">
                    <Users className="h-6 w-6 text-chart-4" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Proyectos Activos</p>
                    <p className="text-3xl font-semibold tabular-nums">
                      {data?.activeProjects ?? 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Projects Timeline */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Proyectos por Mes
          </CardTitle>
          <CardDescription>
            Evolución de proyectos iniciados y cerrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={data?.projectsByMonth || []}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="count"
                  name="Iniciados"
                  fill="hsl(217, 91%, 48%)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="closed"
                  name="Cerrados"
                  fill="hsl(142, 71%, 35%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Projects by Category */}
        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle>Proyectos por Categoría</CardTitle>
            <CardDescription>
              Distribución de proyectos según su tipo
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data?.projectsByCategory || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {(data?.projectsByCategory || []).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
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
            )}
          </CardContent>
        </Card>

        {/* Completion Rate Trend */}
        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle>Tendencia de Tasa de Éxito</CardTitle>
            <CardDescription>
              Porcentaje de proyectos completados a tiempo
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={data?.completionRate || []}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                    formatter={(value: number) => [`${value}%`, "Tasa de éxito"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="hsl(142, 71%, 35%)"
                    fill="hsl(142, 71%, 35%, 0.2)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KPI Table */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Indicadores Clave de Rendimiento</CardTitle>
          <CardDescription>
            Métricas calculadas a partir de los datos del Excel
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (data?.kpis || []).length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No hay KPIs calculados. Carga un archivo Excel para generar indicadores.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(data?.kpis || []).map((kpi) => (
                <div
                  key={kpi.id}
                  className="p-4 flex items-center justify-between gap-4"
                  data-testid={`kpi-row-${kpi.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {kpi.kpiCategory || "General"}
                    </Badge>
                    <span className="font-medium">{kpi.kpiName}</span>
                  </div>
                  <span className="text-lg font-semibold tabular-nums">
                    {kpi.kpiValue}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
