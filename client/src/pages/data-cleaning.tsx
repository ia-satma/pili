import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, CheckCircle2, RefreshCw, Save, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";

interface Project {
  id: number;
  projectName: string;
  description: string | null;
  departmentName: string | null;
  responsible: string | null;
  status: string | null;
  percentComplete: number | null;
  startDate: string | null;
  endDateEstimated: string | null;
  dataHealthScore: number;
  validationErrors: Record<string, string>;
  isClean: boolean;
}

interface HealthStats {
  totalProjects: number;
  cleanProjects: number;
  dirtyProjects: number;
  averageScore: number;
}

interface AuditResult {
  totalProjects: number;
  cleanProjects: number;
  dirtyProjects: number;
  averageScore: number;
  validatedAt: string;
}

export default function DataCleaning() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<Project>>({});

  const { data: stats, isLoading: statsLoading } = useQuery<HealthStats>({
    queryKey: ["/api/health/stats"],
  });

  const { data: dirtyProjects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/health/dirty-projects"],
  });

  const runAuditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/health/audit");
      return res.json() as Promise<AuditResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/health/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/health/dirty-projects"] });
      toast({
        title: "Auditoría completada",
        description: `${data.cleanProjects} de ${data.totalProjects} proyectos están limpios. Puntaje promedio: ${data.averageScore}%`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo ejecutar la auditoría",
        variant: "destructive",
      });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Project> }) => {
      const res = await apiRequest("PATCH", `/api/projects/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/health/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/health/dirty-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"], exact: false });
      setEditingId(null);
      setEditValues({});
      toast({
        title: "Proyecto actualizado",
        description: "Los cambios se guardaron y el proyecto fue re-validado",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el proyecto",
        variant: "destructive",
      });
    },
  });

  const startEditing = (project: Project) => {
    setEditingId(project.id);
    setEditValues({
      projectName: project.projectName,
      description: project.description,
      departmentName: project.departmentName,
      responsible: project.responsible,
      status: project.status,
      percentComplete: project.percentComplete,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEditing = () => {
    if (editingId === null) return;
    updateProjectMutation.mutate({ id: editingId, data: editValues });
  };

  const isLoading = statsLoading || projectsLoading;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Centro de Limpieza de Datos</h1>
          <p className="text-muted-foreground">
            Revisa y corrige proyectos con datos incompletos o erróneos
          </p>
        </div>
        <Button
          onClick={() => runAuditMutation.mutate()}
          disabled={runAuditMutation.isPending}
          data-testid="button-run-audit"
        >
          {runAuditMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Ejecutar Auditoría Completa
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="overflow-visible">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold" data-testid="text-total-projects">{stats.totalProjects}</p>
                <p className="text-sm text-muted-foreground">Total Proyectos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-visible border-traffic-green/30">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-traffic-green" data-testid="text-clean-projects">{stats.cleanProjects}</p>
                <p className="text-sm text-muted-foreground">Proyectos Limpios</p>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-visible border-traffic-yellow/30">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-traffic-yellow" data-testid="text-dirty-projects">{stats.dirtyProjects}</p>
                <p className="text-sm text-muted-foreground">Requieren Atención</p>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-visible">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold" data-testid="text-avg-score">{stats.averageScore}%</p>
                <p className="text-sm text-muted-foreground">Salud Promedio</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-traffic-yellow" />
            Proyectos con Errores de Validación
          </CardTitle>
          <CardDescription>
            Haz clic en un proyecto para editar sus campos y corregir los errores
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : dirtyProjects && dirtyProjects.length > 0 ? (
            <div className="space-y-4">
              {dirtyProjects.map((project) => (
                <div
                  key={project.id}
                  className="border rounded-lg p-4 space-y-3"
                  data-testid={`project-row-${project.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{project.projectName}</span>
                        <Badge variant="outline" className="text-xs">
                          ID: {project.id}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={project.dataHealthScore} className="h-2 w-24" />
                        <span className="text-xs text-muted-foreground">
                          {project.dataHealthScore}% salud
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {editingId === project.id ? (
                        <>
                          <Button
                            size="sm"
                            onClick={saveEditing}
                            disabled={updateProjectMutation.isPending}
                            data-testid={`button-save-${project.id}`}
                          >
                            {updateProjectMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEditing}
                            data-testid={`button-cancel-${project.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEditing(project)}
                          data-testid={`button-edit-${project.id}`}
                        >
                          Editar
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {Object.entries(project.validationErrors).map(([field, error]) => (
                      <Badge
                        key={field}
                        variant="outline"
                        className="border-traffic-red/50 text-traffic-red text-xs"
                      >
                        {field}: {error}
                      </Badge>
                    ))}
                  </div>

                  {editingId === project.id && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t">
                      <div>
                        <label className="text-xs text-muted-foreground">Nombre</label>
                        <Input
                          value={editValues.projectName || ""}
                          onChange={(e) => setEditValues({ ...editValues, projectName: e.target.value })}
                          className={project.validationErrors.projectName ? "border-traffic-red" : ""}
                          data-testid={`input-name-${project.id}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Departamento</label>
                        <Input
                          value={editValues.departmentName || ""}
                          onChange={(e) => setEditValues({ ...editValues, departmentName: e.target.value })}
                          className={project.validationErrors.departmentName ? "border-traffic-red" : ""}
                          data-testid={`input-dept-${project.id}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Responsable</label>
                        <Input
                          value={editValues.responsible || ""}
                          onChange={(e) => setEditValues({ ...editValues, responsible: e.target.value })}
                          className={project.validationErrors.responsible ? "border-traffic-red" : ""}
                          data-testid={`input-responsible-${project.id}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Estado</label>
                        <Input
                          value={editValues.status || ""}
                          onChange={(e) => setEditValues({ ...editValues, status: e.target.value })}
                          className={project.validationErrors.status ? "border-traffic-red" : ""}
                          data-testid={`input-status-${project.id}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">% Avance</label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={editValues.percentComplete ?? ""}
                          onChange={(e) => setEditValues({ ...editValues, percentComplete: parseInt(e.target.value) || 0 })}
                          className={project.validationErrors.percentComplete ? "border-traffic-red" : ""}
                          data-testid={`input-percent-${project.id}`}
                        />
                      </div>
                      <div className="md:col-span-2 lg:col-span-1">
                        <label className="text-xs text-muted-foreground">Descripción</label>
                        <Input
                          value={editValues.description || ""}
                          onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                          className={project.validationErrors.description ? "border-traffic-red" : ""}
                          data-testid={`input-desc-${project.id}`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-traffic-green mb-4" />
              <p className="text-lg font-medium text-traffic-green">
                Todos los proyectos están limpios
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                No hay proyectos con errores de validación
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
