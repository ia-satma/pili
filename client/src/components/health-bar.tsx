import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";

interface HealthStats {
  totalProjects: number;
  cleanProjects: number;
  dirtyProjects: number;
  averageScore: number;
}

export function HealthBar() {
  const [, setLocation] = useLocation();
  
  const { data: stats, isLoading } = useQuery<HealthStats>({
    queryKey: ["/api/health/stats"],
    refetchInterval: 30000,
  });

  if (isLoading || !stats) {
    return null;
  }

  if (stats.dirtyProjects === 0) {
    return (
      <div 
        className="flex items-center gap-3 px-4 py-2 bg-traffic-green/10 border border-traffic-green/20 rounded-lg"
        data-testid="health-bar-clean"
      >
        <CheckCircle2 className="h-5 w-5 text-traffic-green flex-shrink-0" />
        <span className="text-sm text-traffic-green font-medium">
          Todos los proyectos tienen datos completos
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Activity className="h-4 w-4 text-traffic-green" />
          <span className="text-sm font-bold text-traffic-green">{stats.averageScore}%</span>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-wrap items-center gap-3 px-4 py-3 bg-traffic-yellow/10 border border-traffic-yellow/30 rounded-lg"
      data-testid="health-bar-dirty"
    >
      <AlertTriangle className="h-5 w-5 text-traffic-yellow flex-shrink-0" />
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">
            {stats.dirtyProjects} proyecto{stats.dirtyProjects !== 1 ? "s" : ""} con datos incompletos
          </span>
          <span className="text-xs text-muted-foreground">
            {stats.averageScore}% salud promedio
          </span>
        </div>
        <Progress 
          value={stats.averageScore} 
          className="h-2"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setLocation("/admin/data-cleaning")}
        className="border-traffic-yellow/50 text-traffic-yellow hover:bg-traffic-yellow/10"
        data-testid="button-go-cleaning"
      >
        Ir al Centro de Limpieza
      </Button>
    </div>
  );
}
