import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Eye,
  Download,
  Loader2,
  Save,
  Trash2,
  BookmarkCheck,
  RefreshCw,
  AlertTriangle,
  Lock,
  User,
  X,
  Sparkles,
  Check,
  ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFilters } from "@/contexts/filter-context";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TrafficLight, calculateTrafficLight } from "./traffic-light";
import { ProjectDetailDrawer } from "./project-detail-drawer";
import type { Project, ProjectUpdate, Milestone, ChangeLog, FilterPreset } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ProjectsResponse {
  projects: Project[];
  total: number;
}

interface ProjectDetailResponse {
  project: Project;
  updates: ProjectUpdate[];
  milestones: Milestone[];
  changeLogs: ChangeLog[];
}

interface FilterPresetsResponse {
  presets: FilterPreset[];
}

type SortField = "projectName" | "departmentName" | "status" | "endDateEstimated" | "percentComplete";
type SortDirection = "asc" | "desc";

const STATUS_OPTIONS = ["Abierto", "En Progreso", "Cerrado", "Cancelado", "En Pausa"];
const PRIORITY_OPTIONS = ["Alta", "Media", "Baja"];

type BulkField = "status" | "priority" | "responsible";

export function ProjectsGrid() {
  const { filters, setFilters, hasActiveFilters, clearFilters: clearGlobalFilters, buildQueryString } = useFilters();
  const [sortField, setSortField] = useState<SortField>("projectName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkUpdateField, setBulkUpdateField] = useState<BulkField | null>(null);
  const [bulkUpdateValue, setBulkUpdateValue] = useState("");
  
  const [enrichDialogOpen, setEnrichDialogOpen] = useState(false);
  const [enrichingProjectId, setEnrichingProjectId] = useState<number | null>(null);
  const [enrichmentData, setEnrichmentData] = useState<{
    projectId: number;
    projectName: string;
    original: {
      problemStatement: string | null;
      scopeIn: string | null;
      scopeOut: string | null;
      objective: string | null;
    };
    suggestion: {
      problemStatement: string;
      scopeIn: string;
      scopeOut: string;
      objective: string;
    } | null;
  } | null>(null);
  
  const pageSize = 20;
  const { toast } = useToast();
  const { isAdmin, isEditor } = useAuth();
  
  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filters.q, filters.estado, filters.depto, filters.analista]);

  const queryString = buildQueryString();
  const { data, isLoading, error } = useQuery<ProjectsResponse>({
    queryKey: ["/api/projects", queryString],
    queryFn: () => fetch(`/api/projects${queryString ? `?${queryString}` : ""}`).then(r => r.json()),
  });

  const { data: projectDetail, isLoading: isLoadingDetail } = useQuery<ProjectDetailResponse>({
    queryKey: ["/api/projects", selectedProjectId],
    enabled: !!selectedProjectId,
  });

  const { data: presetsData } = useQuery<FilterPresetsResponse>({
    queryKey: ["/api/filter-presets"],
  });

  const createPresetMutation = useMutation({
    mutationFn: async (data: { name: string; filters: { search: string; status: string; department: string } }) => {
      return apiRequest("POST", "/api/filter-presets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/filter-presets"] });
      setSaveDialogOpen(false);
      setPresetName("");
      toast({
        title: "Filtro guardado",
        description: "El preset de filtro se guardó correctamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar el preset de filtro",
        variant: "destructive",
      });
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/filter-presets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/filter-presets"] });
      setActivePresetId(null);
      toast({
        title: "Filtro eliminado",
        description: "El preset de filtro se eliminó correctamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar el preset de filtro",
        variant: "destructive",
      });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: { ids: number[]; field: string; value: string }) => {
      return apiRequest("POST", "/api/projects/bulk/update", data);
    },
    onSuccess: async (response) => {
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedIds(new Set());
      setBulkUpdateDialogOpen(false);
      setBulkUpdateField(null);
      setBulkUpdateValue("");
      toast({
        title: "Actualización masiva completada",
        description: result.message || `Se actualizaron ${result.updatedCount} proyectos`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudieron actualizar los proyectos",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", "/api/projects/bulk/delete", { ids });
    },
    onSuccess: async (response) => {
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedIds(new Set());
      setBulkDeleteDialogOpen(false);
      toast({
        title: "Eliminación masiva completada",
        description: result.message || `Se eliminaron ${result.deletedCount} proyectos`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudieron eliminar los proyectos",
        variant: "destructive",
      });
    },
  });

  const enrichMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/enrich`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.suggestion) {
        setEnrichmentData({
          projectId: data.projectId,
          projectName: data.projectName,
          original: data.original,
          suggestion: data.suggestion,
        });
        setEnrichDialogOpen(true);
      } else {
        toast({
          title: "Error",
          description: data.error || "No se pudieron generar sugerencias",
          variant: "destructive",
        });
      }
      setEnrichingProjectId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Error al conectar con el servicio de IA",
        variant: "destructive",
      });
      setEnrichingProjectId(null);
    },
  });

  const applyEnrichmentMutation = useMutation({
    mutationFn: async ({ projectId, data }: { projectId: number; data: Record<string, string> }) => {
      return apiRequest("PATCH", `/api/projects/${projectId}`, data);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEnrichDialogOpen(false);
      setEnrichmentData(null);
      
      if (enrichmentData?.projectId) {
        await apiRequest("POST", `/api/projects/${enrichmentData.projectId}/audit`);
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      }
      
      toast({
        title: "Cambios aplicados",
        description: "El proyecto ha sido actualizado con las sugerencias de IA",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudieron aplicar los cambios",
        variant: "destructive",
      });
    },
  });

  const handleEnrichProject = (projectId: number) => {
    setEnrichingProjectId(projectId);
    enrichMutation.mutate(projectId);
  };

  const handleApplyEnrichment = () => {
    if (!enrichmentData?.suggestion || !enrichmentData.projectId) return;
    
    applyEnrichmentMutation.mutate({
      projectId: enrichmentData.projectId,
      data: {
        problemStatement: enrichmentData.suggestion.problemStatement,
        scopeIn: enrichmentData.suggestion.scopeIn,
        scopeOut: enrichmentData.suggestion.scopeOut,
        objective: enrichmentData.suggestion.objective,
      },
    });
  };

  // Extract unique statuses, departments, responsibles, and Business Process Analysts for filters
  const { statuses, departments, responsibles, businessProcessAnalysts } = useMemo(() => {
    if (!data?.projects) return { statuses: [], departments: [], responsibles: [], businessProcessAnalysts: [] };
    
    const statusSet = new Set<string>();
    const deptSet = new Set<string>();
    const respSet = new Set<string>();
    const analystSet = new Set<string>();
    
    data.projects.forEach((p) => {
      if (p.status) statusSet.add(p.status);
      if (p.departmentName) deptSet.add(p.departmentName);
      if (p.responsible) respSet.add(p.responsible);
      
      // Extract Business Process Analyst from extraFields
      const extraFields = p.extraFields as Record<string, unknown> | null;
      if (extraFields) {
        const analyst = extraFields["Business Process Analyst"] as string | undefined;
        if (analyst && typeof analyst === "string" && analyst.trim()) {
          analystSet.add(analyst.trim());
        }
      }
    });
    
    return {
      statuses: Array.from(statusSet).sort(),
      departments: Array.from(deptSet).sort(),
      responsibles: Array.from(respSet).sort(),
      businessProcessAnalysts: Array.from(analystSet).sort(),
    };
  }, [data?.projects]);

  // Filter and sort projects using global filter context
  const filteredProjects = useMemo(() => {
    if (!data?.projects) return [];

    let filtered = data.projects.filter((project) => {
      // Search filter (using global q)
      if (filters.q) {
        const searchLower = filters.q.toLowerCase();
        const matchesSearch =
          project.projectName?.toLowerCase().includes(searchLower) ||
          project.responsible?.toLowerCase().includes(searchLower) ||
          project.departmentName?.toLowerCase().includes(searchLower) ||
          project.legacyId?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Status filter (using global estado)
      if (filters.estado !== "all" && project.status !== filters.estado) {
        return false;
      }

      // Department filter (using global depto)
      if (filters.depto !== "all" && project.departmentName !== filters.depto) {
        return false;
      }

      // Business Process Analyst filter (using global analista)
      if (filters.analista !== "all") {
        const extraFields = project.extraFields as Record<string, unknown> | null;
        const analyst = extraFields?.["Business Process Analyst"] as string | undefined;
        if (!analyst || analyst.trim() !== filters.analista) {
          return false;
        }
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";

      if (typeof aVal === "string" && typeof bVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [data?.projects, filters.q, filters.estado, filters.depto, filters.analista, sortField, sortDirection]);

  // Paginate
  const paginatedProjects = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, page, pageSize]);

  const totalPages = Math.ceil(filteredProjects.length / pageSize);

  // Selection helpers (must be after paginatedProjects)
  const visibleProjectIds = useMemo(() => {
    return paginatedProjects.map(p => p.id);
  }, [paginatedProjects]);

  const allVisibleSelected = useMemo(() => {
    if (visibleProjectIds.length === 0) return false;
    return visibleProjectIds.every(id => selectedIds.has(id));
  }, [visibleProjectIds, selectedIds]);

  const someVisibleSelected = useMemo(() => {
    if (visibleProjectIds.length === 0) return false;
    return visibleProjectIds.some(id => selectedIds.has(id)) && !allVisibleSelected;
  }, [visibleProjectIds, selectedIds, allVisibleSelected]);

  const handleSelectAll = () => {
    if (allVisibleSelected) {
      const newSelected = new Set(selectedIds);
      visibleProjectIds.forEach(id => newSelected.delete(id));
      setSelectedIds(newSelected);
    } else {
      const newSelected = new Set(selectedIds);
      visibleProjectIds.forEach(id => newSelected.add(id));
      setSelectedIds(newSelected);
    }
  };

  const handleSelectProject = (projectId: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(projectId);
    } else {
      newSelected.delete(projectId);
    }
    setSelectedIds(newSelected);
  };

  const handleOpenBulkUpdate = (field: BulkField) => {
    setBulkUpdateField(field);
    setBulkUpdateValue("");
    setBulkUpdateDialogOpen(true);
  };

  const handleBulkUpdate = () => {
    if (!bulkUpdateField || !bulkUpdateValue || selectedIds.size === 0) return;
    bulkUpdateMutation.mutate({
      ids: Array.from(selectedIds),
      field: bulkUpdateField,
      value: bulkUpdateValue,
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const clearFilters = () => {
    clearGlobalFilters();
    setActivePresetId(null);
    setPage(1);
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    
    createPresetMutation.mutate({
      name: presetName.trim(),
      filters: {
        search: filters.q,
        status: filters.estado,
        department: filters.depto,
      },
    });
  };

  const handleApplyPreset = (presetId: string) => {
    if (presetId === "none") {
      clearFilters();
      return;
    }
    
    const preset = presetsData?.presets.find(p => p.id === parseInt(presetId));
    if (preset && preset.filters) {
      setFilters({
        q: preset.filters.search || "",
        estado: preset.filters.status || "all",
        depto: preset.filters.department || "all",
      });
      setActivePresetId(preset.id);
      setPage(1);
    }
  };

  const handleDeletePreset = (e: React.MouseEvent, presetId: number) => {
    e.preventDefault();
    e.stopPropagation();
    deletePresetMutation.mutate(presetId);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/projects/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          search: filters.q || undefined,
          status: filters.estado !== "all" ? filters.estado : undefined,
          department: filters.depto !== "all" ? filters.depto : undefined,
          analista: filters.analista !== "all" ? filters.analista : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Error al exportar");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().split("T")[0];
      a.download = `proyectos_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Exportación completada",
        description: `Se exportaron ${filteredProjects.length} proyectos`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Error al exportar",
        description: "No se pudo generar el archivo Excel. Intente de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "—";
    try {
      // Add T12:00:00 to avoid timezone issues with date-only strings
      const dateStr = date.includes("T") ? date : `${date}T12:00:00`;
      return format(new Date(dateStr), "dd/MM/yy", { locale: es });
    } catch {
      return date;
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? (
      <ChevronUp className="h-3 w-3 ml-1" />
    ) : (
      <ChevronDown className="h-3 w-3 ml-1" />
    );
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Error al cargar los proyectos
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start">
        <div className="flex-1 w-full">
          <FilterBar showResultCount resultCount={filteredProjects.length} />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(true)}
              data-testid="button-save-filter"
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar Filtro
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || isLoading}
            data-testid="button-export-excel"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Seleccionar todos"
                  data-testid="checkbox-select-all"
                  className={someVisibleSelected ? "data-[state=checked]:bg-primary/50" : ""}
                />
              </TableHead>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead>
                <button
                  className="flex items-center font-medium hover:text-foreground"
                  onClick={() => handleSort("projectName")}
                  data-testid="sort-project-name"
                >
                  Proyecto
                  <SortIcon field="projectName" />
                </button>
              </TableHead>
              <TableHead>Problema</TableHead>
              <TableHead>Analista (BP)</TableHead>
              <TableHead>
                <button
                  className="flex items-center font-medium hover:text-foreground"
                  onClick={() => handleSort("status")}
                  data-testid="sort-status"
                >
                  Status
                  <SortIcon field="status" />
                </button>
              </TableHead>
              <TableHead>Impacto</TableHead>
              <TableHead>Presupuesto</TableHead>
              <TableHead>
                <button
                  className="flex items-center font-medium hover:text-foreground"
                  onClick={() => handleSort("endDateEstimated")}
                  data-testid="sort-end-date"
                >
                  Fin Estimado
                  <SortIcon field="endDateEstimated" />
                </button>
              </TableHead>
              <TableHead className="w-24 text-center">Salud de Datos</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-3 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : paginatedProjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="h-32 text-center text-muted-foreground">
                  No se encontraron proyectos
                </TableCell>
              </TableRow>
            ) : (
              paginatedProjects.map((project) => {
                const trafficLight = calculateTrafficLight(
                  project.endDateEstimated,
                  project.endDateEstimatedTbd,
                  project.status,
                  project.estatusAlDia
                );
                
                return (
                  <TableRow
                    key={project.id}
                    className={cn(
                      "hover-elevate cursor-pointer",
                      selectedProjectId === project.id && "bg-muted/50",
                      selectedIds.has(project.id) && "bg-primary/5"
                    )}
                    onClick={() => setSelectedProjectId(project.id)}
                    data-testid={`project-row-${project.id}`}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(project.id)}
                        onCheckedChange={(checked) => {
                          handleSelectProject(project.id, checked === true);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Seleccionar ${project.projectName}`}
                        data-testid={`checkbox-select-project-${project.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <TrafficLight status={trafficLight} size="sm" />
                    </TableCell>
                    <TableCell className="w-[80px] font-mono text-xs text-muted-foreground" data-testid={`cell-id-${project.id}`}>
                      {project.legacyId || "—"}
                    </TableCell>
                    <TableCell className="font-bold max-w-[250px] truncate" data-testid={`cell-project-name-${project.id}`}>
                      {project.projectName || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate" title={project.problemStatement || project.description || ""}>
                      {project.problemStatement || project.description || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[150px] truncate">
                      {(() => {
                        const bpAnalyst = project.bpAnalyst;
                        if (bpAnalyst) return bpAnalyst;
                        const extraFields = project.extraFields as Record<string, unknown> | null;
                        const analyst = extraFields?.["Business Process Analyst"] as string | undefined;
                        return analyst || "—";
                      })()}
                    </TableCell>
                    <TableCell>
                      {project.status ? (
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "font-normal",
                            project.status.toLowerCase().includes("abierto") && "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
                            project.status.toLowerCase().includes("progreso") && "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
                            project.status.toLowerCase().includes("cerrado") && "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
                            project.status.toLowerCase().includes("cancelado") && "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
                            project.status.toLowerCase().includes("pausa") && "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/30"
                          )}
                          data-testid={`cell-status-${project.id}`}
                        >
                          {project.status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const impactArray = project.impactType as string[] | null;
                        if (!impactArray || impactArray.length === 0) return <span className="text-muted-foreground">—</span>;
                        return (
                          <div className="flex flex-wrap gap-1">
                            {impactArray.slice(0, 3).map((impact, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs font-normal">
                                {impact}
                              </Badge>
                            ))}
                            {impactArray.length > 3 && (
                              <Badge variant="outline" className="text-xs font-normal">
                                +{impactArray.length - 3}
                              </Badge>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="font-mono text-sm tabular-nums" data-testid={`cell-budget-${project.id}`}>
                      {(() => {
                        const budgetValue = project.budget;
                        if (budgetValue === null || budgetValue === undefined || budgetValue === 0) {
                          return "—";
                        }
                        return new Intl.NumberFormat("es-MX", {
                          style: "currency",
                          currency: "MXN",
                        }).format(budgetValue);
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(project.endDate || project.endDateEstimated)}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const score = project.healthScore ?? 100;
                        const flags = (project.auditFlags as string[]) || [];
                        let bgClass = "bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/30";
                        let label = "Sólido";
                        
                        if (score < 50) {
                          bgClass = "bg-red-500/20 text-red-700 dark:text-red-400 border border-red-500/30";
                          label = "Crítico";
                        } else if (score < 80) {
                          bgClass = "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30";
                          label = "Revisar";
                        }
                        
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium cursor-help", bgClass)}
                                data-testid={`badge-health-${project.id}`}
                              >
                                {label}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <p className="font-medium mb-1">Puntaje: {score}/100</p>
                              {flags.length > 0 ? (
                                <ul className="text-xs space-y-1">
                                  {flags.map((flag, idx) => (
                                    <li key={idx}>{flag}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs">Sin problemas detectados</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEnrichProject(project.id);
                              }}
                              disabled={enrichingProjectId === project.id}
                              data-testid={`button-enrich-project-${project.id}`}
                            >
                              {enrichingProjectId === project.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Mejorar con IA</TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProjectId(project.id);
                          }}
                          data-testid={`button-view-project-${project.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              data-testid="button-prev-page"
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              data-testid="button-next-page"
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Project Detail Drawer */}
      <ProjectDetailDrawer
        project={projectDetail?.project || null}
        updates={projectDetail?.updates}
        milestones={projectDetail?.milestones}
        changeLogs={projectDetail?.changeLogs}
        isOpen={!!selectedProjectId}
        onClose={() => setSelectedProjectId(null)}
      />

      {/* Save Filter Preset Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar Filtro</DialogTitle>
            <DialogDescription>
              Guarda la configuración actual de filtros para usarla después.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Nombre del filtro</Label>
              <Input
                id="preset-name"
                placeholder="Ej: Proyectos activos IT"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                data-testid="input-preset-name"
              />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium">Filtros actuales:</p>
              {filters.q && <p>Búsqueda: {filters.q}</p>}
              {filters.estado !== "all" && <p>Estado: {filters.estado}</p>}
              {filters.depto !== "all" && <p>Departamento: {filters.depto}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSaveDialogOpen(false);
                setPresetName("");
              }}
              data-testid="button-cancel-save-filter"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSavePreset}
              disabled={!presetName.trim() || createPresetMutation.isPending}
              data-testid="button-confirm-save-filter"
            >
              {createPresetMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border border-border rounded-lg shadow-lg p-4 flex items-center gap-4 z-50">
          <span className="text-sm font-medium" data-testid="text-selected-count">
            {selectedIds.size} proyecto{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            {isEditor ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenBulkUpdate("status")}
                  disabled={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
                  data-testid="button-bulk-update-status"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualizar Estado
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenBulkUpdate("priority")}
                  disabled={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
                  data-testid="button-bulk-update-priority"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualizar Prioridad
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenBulkUpdate("responsible")}
                  disabled={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
                  data-testid="button-bulk-update-responsible"
                >
                  <User className="h-4 w-4 mr-2" />
                  Actualizar Responsable
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                <span>Sin permisos de edición</span>
              </div>
            )}
            {isAdmin && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteDialogOpen(true)}
                disabled={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Bulk Update Dialog */}
      <Dialog open={bulkUpdateDialogOpen} onOpenChange={setBulkUpdateDialogOpen} data-testid="dialog-bulk-update">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Actualizar {bulkUpdateField === "status" ? "Estado" : bulkUpdateField === "priority" ? "Prioridad" : "Responsable"}
            </DialogTitle>
            <DialogDescription>
              Selecciona el nuevo valor para los {selectedIds.size} proyectos seleccionados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-update-value">
                Nuevo {bulkUpdateField === "status" ? "Estado" : bulkUpdateField === "priority" ? "Prioridad" : "Responsable"}
              </Label>
              {bulkUpdateField === "responsible" ? (
                <Select value={bulkUpdateValue} onValueChange={setBulkUpdateValue}>
                  <SelectTrigger data-testid="select-bulk-update-value">
                    <SelectValue placeholder="Seleccionar responsable" />
                  </SelectTrigger>
                  <SelectContent>
                    {responsibles.map((resp) => (
                      <SelectItem key={resp} value={resp}>
                        {resp}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={bulkUpdateValue} onValueChange={setBulkUpdateValue}>
                  <SelectTrigger data-testid="select-bulk-update-value">
                    <SelectValue placeholder={`Seleccionar ${bulkUpdateField === "status" ? "estado" : "prioridad"}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(bulkUpdateField === "status" ? STATUS_OPTIONS : PRIORITY_OPTIONS).map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBulkUpdateDialogOpen(false);
                setBulkUpdateField(null);
                setBulkUpdateValue("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleBulkUpdate}
              disabled={!bulkUpdateValue || bulkUpdateMutation.isPending}
            >
              {bulkUpdateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Actualizar {selectedIds.size} proyecto{selectedIds.size !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-bulk-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar eliminación
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar {selectedIds.size} proyecto{selectedIds.size !== 1 ? "s" : ""}? 
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Enrichment Dialog */}
      <Dialog open={enrichDialogOpen} onOpenChange={(open) => {
        setEnrichDialogOpen(open);
        if (!open) setEnrichmentData(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-ai-enrichment">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Mejorar Proyecto con IA
            </DialogTitle>
            <DialogDescription>
              {enrichmentData?.projectName && (
                <span className="font-medium">{enrichmentData.projectName}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {enrichmentData?.suggestion && (
            <div className="space-y-6 py-4">
              {/* Problem Statement Comparison */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  Problem Statement
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Antes</p>
                    <div className="p-3 rounded-md bg-muted/50 text-sm min-h-[100px]">
                      {enrichmentData.original.problemStatement || (
                        <span className="text-muted-foreground italic">Sin definir</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-primary font-medium flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      Después (Sugerencia IA)
                    </p>
                    <div className="p-3 rounded-md bg-primary/10 border border-primary/20 text-sm min-h-[100px]">
                      {enrichmentData.suggestion.problemStatement}
                    </div>
                  </div>
                </div>
              </div>

              {/* Objective Comparison */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  Objetivo
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Antes</p>
                    <div className="p-3 rounded-md bg-muted/50 text-sm min-h-[80px]">
                      {enrichmentData.original.objective || (
                        <span className="text-muted-foreground italic">Sin definir</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-primary font-medium flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      Después (Sugerencia IA)
                    </p>
                    <div className="p-3 rounded-md bg-primary/10 border border-primary/20 text-sm min-h-[80px]">
                      {enrichmentData.suggestion.objective}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scope In Comparison */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  Alcance Incluido
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Antes</p>
                    <div className="p-3 rounded-md bg-muted/50 text-sm min-h-[80px] whitespace-pre-wrap">
                      {enrichmentData.original.scopeIn || (
                        <span className="text-muted-foreground italic">Sin definir</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-primary font-medium flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      Después (Sugerencia IA)
                    </p>
                    <div className="p-3 rounded-md bg-primary/10 border border-primary/20 text-sm min-h-[80px] whitespace-pre-wrap">
                      {enrichmentData.suggestion.scopeIn}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scope Out Comparison */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  Fuera de Alcance
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Antes</p>
                    <div className="p-3 rounded-md bg-muted/50 text-sm min-h-[60px] whitespace-pre-wrap">
                      {enrichmentData.original.scopeOut || (
                        <span className="text-muted-foreground italic">Sin definir</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-primary font-medium flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      Después (Sugerencia IA)
                    </p>
                    <div className="p-3 rounded-md bg-primary/10 border border-primary/20 text-sm min-h-[60px] whitespace-pre-wrap">
                      {enrichmentData.suggestion.scopeOut}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEnrichDialogOpen(false);
                setEnrichmentData(null);
              }}
              data-testid="button-cancel-enrichment"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleApplyEnrichment}
              disabled={applyEnrichmentMutation.isPending}
              data-testid="button-apply-enrichment"
            >
              {applyEnrichmentMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Aplicar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
