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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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

type SortField = "projectName" | "departmentName" | "status" | "endDateEstimated" | "percentComplete" | "ranking" | "totalValor" | "totalEsfuerzo" | "puntajeTotal";
type SortDirection = "asc" | "desc";

const STATUS_OPTIONS = ["Abierto", "En Progreso", "Cerrado", "Cancelado", "En Pausa"];
const PRIORITY_OPTIONS = ["Alta", "Media", "Baja"];

type BulkField = "status" | "priority" | "responsible";

interface ColumnConfig {
  key: string;
  header: string;
  width?: string;
  sticky?: boolean;
  stickyLeft?: number;
  sortable?: boolean;
  sortField?: SortField;
  align?: "left" | "center" | "right";
  type?: "text" | "date" | "number" | "badge" | "boolean" | "longtext";
}

const COLUMN_ORDER: ColumnConfig[] = [
  { key: "_checkbox", header: "", width: "40px", sticky: true, stickyLeft: 0 },
  { key: "_trafficLight", header: "", width: "40px", sticky: true, stickyLeft: 40 },
  { key: "previo", header: "Previo", width: "80px", sticky: true, stickyLeft: 80 },
  { key: "ranking", header: "Ranking", width: "70px", sticky: true, stickyLeft: 160, sortable: true, sortField: "ranking", align: "center", type: "number" },
  { key: "projectName", header: "Iniciativa", width: "250px", sticky: true, stickyLeft: 230, sortable: true, sortField: "projectName" },
  { key: "legacyId", header: "ID Power Steering", width: "120px" },
  { key: "cardIdDevops", header: "Card ID DevOps", width: "120px" },
  { key: "problemStatement", header: "Descripción", width: "200px", type: "longtext" },
  { key: "valorDiferenciador", header: "Valor / Diferenciador", width: "180px", type: "longtext" },
  { key: "registrationDate", header: "Fecha de Registro", width: "120px", type: "date" },
  { key: "startDate", header: "Fecha Inicio", width: "110px", type: "date" },
  { key: "endDateEstimated", header: "Fecha de Término", width: "120px", type: "date", sortable: true, sortField: "endDateEstimated" },
  { key: "tiempoCicloDias", header: "T. de Ciclo en días", width: "110px", align: "center", type: "number" },
  { key: "estatusAlDia", header: "ESTATUS AL DÍA", width: "130px", type: "badge" },
  { key: "departmentName", header: "Proceso de Negocio", width: "160px", sortable: true, sortField: "departmentName" },
  { key: "ingresadaEnPbot", header: "Ingresada en PBOT", width: "130px" },
  { key: "grupoTecnicoAsignado", header: "Grupo Técnico Asignado", width: "160px" },
  { key: "status", header: "Tipo de Iniciativa", width: "140px", sortable: true, sortField: "status", type: "badge" },
  { key: "citizenDeveloper", header: "Citizen Developer", width: "140px" },
  { key: "sponsor", header: "Dueño del Proceso", width: "140px" },
  { key: "leader", header: "Líder o Solicitante", width: "140px" },
  { key: "dtcLead", header: "DTC Lead", width: "120px" },
  { key: "blackBeltLead", header: "Black Belt Lead", width: "130px" },
  { key: "bpAnalyst", header: "Business Process Analyst", width: "160px" },
  { key: "totalValor", header: "Total Valor", width: "100px", align: "right", type: "number", sortable: true, sortField: "totalValor" },
  { key: "totalEsfuerzo", header: "Total Esfuerzo", width: "110px", align: "right", type: "number", sortable: true, sortField: "totalEsfuerzo" },
  { key: "puntajeTotal", header: "Puntaje Total", width: "110px", align: "right", type: "number", sortable: true, sortField: "puntajeTotal" },
  { key: "statusText", header: "ESTATUS Y SIGUIENTES PASOS", width: "250px", type: "longtext" },
  { key: "accionesAcelerar", header: "Acciones a Ejecutar", width: "200px", type: "longtext" },
  { key: "businessImpactGrowth", header: "Business Impact Growth", width: "160px" },
  { key: "businessImpactCostos", header: "Business Impact Costos", width: "160px" },
  { key: "businessImpactOther", header: "Business Impact Other", width: "160px" },
  { key: "fase", header: "Fase", width: "100px", type: "badge" },
  { key: "dependenciasItLocal", header: "Dep: IT Local", width: "100px", type: "boolean" },
  { key: "dependenciasTDigital", header: "Dep: T. Digital", width: "110px", type: "boolean" },
  { key: "dependenciasDigitalizacionSsc", header: "Dep: Digitalización SSC", width: "150px", type: "boolean" },
  { key: "dependenciasExterno", header: "Dep: Externo", width: "100px", type: "boolean" },
  { key: "direccionNegocioUsuario", header: "Dirección de Negocio", width: "160px" },
  { key: "impactaGasesEnvasados", header: "Impacta Gases Envasados", width: "160px" },
  { key: "areaProductividad", header: "Área de Productividad", width: "150px" },
  { key: "scoringNivelDemanda", header: "Nivel de Demanda", width: "140px" },
  { key: "scoringTieneSponsor", header: "¿Tiene Sponsor?", width: "120px" },
  { key: "scoringPersonasAfecta", header: "Personas Afecta", width: "130px" },
  { key: "scoringEsReplicable", header: "¿Es Replicable?", width: "120px" },
  { key: "scoringEsEstrategico", header: "¿Es Estratégico?", width: "120px" },
  { key: "scoringTiempoDesarrollo", header: "Tiempo Desarrollo", width: "130px" },
  { key: "scoringCalidadInformacion", header: "Calidad Información", width: "140px" },
  { key: "scoringTiempoConseguirInfo", header: "Tiempo Conseguir Info", width: "150px" },
  { key: "scoringComplejidadTecnica", header: "Complejidad Técnica", width: "140px" },
  { key: "scoringComplejidadCambio", header: "Complejidad Cambio", width: "140px" },
  { key: "objective", header: "Objetivo", width: "180px", type: "longtext" },
  { key: "scopeIn", header: "Qué SÍ incluye", width: "180px", type: "longtext" },
  { key: "scopeOut", header: "Qué NO incluye", width: "180px", type: "longtext" },
  { key: "benefits", header: "Beneficios", width: "180px", type: "longtext" },
  { key: "risks", header: "Riesgos", width: "180px", type: "longtext" },
  { key: "kpis", header: "Indicadores", width: "160px", type: "longtext" },
  { key: "region", header: "Región", width: "100px" },
  { key: "priority", header: "Prioridad", width: "100px", type: "badge" },
  { key: "category", header: "Categoría", width: "120px" },
  { key: "projectType", header: "Tipo de Proyecto", width: "130px" },
  { key: "percentComplete", header: "% Completado", width: "110px", align: "center", type: "number", sortable: true, sortField: "percentComplete" },
  { key: "healthScore", header: "Health Score", width: "100px", align: "center", type: "number" },
  { key: "comments", header: "Comentarios", width: "180px", type: "longtext" },
  { key: "_actions", header: "", width: "50px" },
];

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

  const filteredProjects = useMemo(() => {
    if (!data?.projects) return [];

    let filtered = data.projects.filter((project) => {
      if (filters.q) {
        const searchLower = filters.q.toLowerCase();
        const matchesSearch =
          project.projectName?.toLowerCase().includes(searchLower) ||
          project.responsible?.toLowerCase().includes(searchLower) ||
          project.departmentName?.toLowerCase().includes(searchLower) ||
          project.legacyId?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      if (filters.estado !== "all" && project.status !== filters.estado) {
        return false;
      }

      if (filters.depto !== "all" && project.departmentName !== filters.depto) {
        return false;
      }

      if (filters.analista !== "all") {
        const extraFields = project.extraFields as Record<string, unknown> | null;
        const analyst = extraFields?.["Business Process Analyst"] as string | undefined;
        if (!analyst || analyst.trim() !== filters.analista) {
          return false;
        }
      }

      return true;
    });

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

  const paginatedProjects = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, page, pageSize]);

  const totalPages = Math.ceil(filteredProjects.length / pageSize);

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

  const getProjectValue = (project: Project, key: string): unknown => {
    if (key === "fase") {
      const extraFields = project.extraFields as Record<string, unknown> | null;
      return extraFields?.["Fase"] || extraFields?.["fase"] || (project as Record<string, unknown>).fase;
    }
    if (key === "leader") {
      return project.leader || project.responsible;
    }
    return (project as Record<string, unknown>)[key];
  };

  const renderCellContent = (project: Project, col: ColumnConfig) => {
    const value = getProjectValue(project, col.key);
    
    if (col.type === "date") {
      return (
        <span className="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
          {formatDate(value as string | null)}
        </span>
      );
    }
    
    if (col.type === "number") {
      if (value === null || value === undefined) {
        return <span className="text-muted-foreground">—</span>;
      }
      if (col.key === "puntajeTotal") {
        return <span className="font-bold text-primary tabular-nums">{value}</span>;
      }
      if (col.key === "percentComplete") {
        return <span className="tabular-nums">{value}%</span>;
      }
      return <span className="font-medium tabular-nums">{value}</span>;
    }
    
    if (col.type === "boolean") {
      return value ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      );
    }
    
    if (col.type === "badge") {
      if (!value) return <span className="text-muted-foreground text-xs">—</span>;
      
      const strValue = String(value);
      let badgeClass = "font-normal text-xs";
      
      if (col.key === "estatusAlDia") {
        if (strValue.toLowerCase().includes("tiempo")) {
          badgeClass += " bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
        } else if (strValue.toLowerCase().includes("retras")) {
          badgeClass += " bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
        } else if (strValue.toLowerCase().includes("riesgo")) {
          badgeClass += " bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
        }
      } else if (col.key === "status") {
        if (strValue.toLowerCase().includes("abierto")) {
          badgeClass += " bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";
        } else if (strValue.toLowerCase().includes("progreso")) {
          badgeClass += " bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
        } else if (strValue.toLowerCase().includes("cerrado")) {
          badgeClass += " bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
        } else if (strValue.toLowerCase().includes("cancelado")) {
          badgeClass += " bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
        } else if (strValue.toLowerCase().includes("pausa")) {
          badgeClass += " bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/30";
        }
      } else if (col.key === "priority") {
        if (strValue.toLowerCase() === "alta") {
          badgeClass += " bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
        } else if (strValue.toLowerCase() === "media") {
          badgeClass += " bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
        } else if (strValue.toLowerCase() === "baja") {
          badgeClass += " bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
        }
      }
      
      return (
        <Badge variant="outline" className={badgeClass}>
          {strValue}
        </Badge>
      );
    }
    
    if (col.type === "longtext") {
      const strValue = String(value || "");
      if (!strValue) return <span className="text-muted-foreground text-xs">—</span>;
      
      if (strValue.length > 80) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground truncate block cursor-help max-w-[200px]">
                {strValue.substring(0, 80)}...
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-md">
              <p className="text-sm whitespace-pre-wrap">{strValue}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
      return <span className="text-xs text-muted-foreground">{strValue}</span>;
    }
    
    if (!value) return <span className="text-muted-foreground text-xs">—</span>;
    
    if (col.key === "projectName") {
      return (
        <span className="font-bold truncate block max-w-[240px]" title={String(value)}>
          {String(value)}
        </span>
      );
    }
    
    if (col.key === "legacyId" || col.key === "cardIdDevops") {
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {String(value)}
        </span>
      );
    }
    
    return (
      <span className="text-muted-foreground truncate block max-w-[150px]" title={String(value)}>
        {String(value)}
      </span>
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

      <div className="rounded-md border border-border">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="min-w-max">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {COLUMN_ORDER.map((col) => {
                    const stickyStyle = col.sticky ? {
                      position: "sticky" as const,
                      left: col.stickyLeft,
                      zIndex: 20,
                      backgroundColor: "hsl(var(--muted) / 0.5)",
                    } : {};
                    
                    if (col.key === "_checkbox") {
                      return (
                        <TableHead 
                          key={col.key} 
                          className="w-10 bg-muted/50" 
                          style={stickyStyle}
                        >
                          <Checkbox
                            checked={allVisibleSelected}
                            onCheckedChange={handleSelectAll}
                            aria-label="Seleccionar todos"
                            data-testid="checkbox-select-all"
                            className={someVisibleSelected ? "data-[state=checked]:bg-primary/50" : ""}
                          />
                        </TableHead>
                      );
                    }
                    
                    if (col.key === "_trafficLight") {
                      return (
                        <TableHead 
                          key={col.key} 
                          className="w-10 bg-muted/50" 
                          style={stickyStyle}
                        />
                      );
                    }
                    
                    if (col.key === "_actions") {
                      return <TableHead key={col.key} className="w-10" />;
                    }
                    
                    if (col.sortable && col.sortField) {
                      return (
                        <TableHead 
                          key={col.key} 
                          style={{ ...stickyStyle, width: col.width, minWidth: col.width }}
                          className={cn(col.sticky && "bg-muted/50")}
                        >
                          <button
                            className={cn(
                              "flex items-center font-medium hover:text-foreground whitespace-nowrap",
                              col.align === "right" && "justify-end w-full",
                              col.align === "center" && "justify-center w-full"
                            )}
                            onClick={() => handleSort(col.sortField!)}
                            data-testid={`sort-${col.key}`}
                          >
                            {col.header}
                            <SortIcon field={col.sortField} />
                          </button>
                        </TableHead>
                      );
                    }
                    
                    return (
                      <TableHead 
                        key={col.key} 
                        style={{ ...stickyStyle, width: col.width, minWidth: col.width }}
                        className={cn(
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          col.sticky && "bg-muted/50",
                          "whitespace-nowrap"
                        )}
                      >
                        {col.header}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {COLUMN_ORDER.map((col, j) => (
                        <TableCell key={`skeleton-${i}-${j}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginatedProjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLUMN_ORDER.length} className="h-32 text-center text-muted-foreground">
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
                        {COLUMN_ORDER.map((col) => {
                          const stickyStyle = col.sticky ? {
                            position: "sticky" as const,
                            left: col.stickyLeft,
                            zIndex: 10,
                            backgroundColor: selectedIds.has(project.id) 
                              ? "hsl(var(--primary) / 0.05)" 
                              : selectedProjectId === project.id 
                                ? "hsl(var(--muted) / 0.5)" 
                                : "hsl(var(--background))",
                          } : {};
                          
                          if (col.key === "_checkbox") {
                            return (
                              <TableCell key={col.key} style={stickyStyle} className="bg-background">
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
                            );
                          }
                          
                          if (col.key === "_trafficLight") {
                            return (
                              <TableCell key={col.key} style={stickyStyle} className="bg-background">
                                <TrafficLight status={trafficLight} size="sm" />
                              </TableCell>
                            );
                          }
                          
                          if (col.key === "_actions") {
                            return (
                              <TableCell key={col.key}>
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
                              </TableCell>
                            );
                          }
                          
                          return (
                            <TableCell 
                              key={col.key} 
                              style={stickyStyle}
                              className={cn(
                                col.align === "right" && "text-right",
                                col.align === "center" && "text-center",
                                col.sticky && "bg-background"
                              )}
                              data-testid={`cell-${col.key}-${project.id}`}
                            >
                              {renderCellContent(project, col)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

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

      <ProjectDetailDrawer
        project={projectDetail?.project || null}
        updates={projectDetail?.updates}
        milestones={projectDetail?.milestones}
        changeLogs={projectDetail?.changeLogs}
        isOpen={!!selectedProjectId}
        onClose={() => setSelectedProjectId(null)}
      />

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

      <Dialog open={enrichDialogOpen} onOpenChange={setEnrichDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Sugerencias de IA para "{enrichmentData?.projectName}"
            </DialogTitle>
            <DialogDescription>
              Revisa las sugerencias generadas por IA para mejorar la información del proyecto.
            </DialogDescription>
          </DialogHeader>
          
          {enrichmentData?.suggestion && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2 text-muted-foreground">Original</h4>
                </div>
                <div>
                  <h4 className="font-medium mb-2 text-primary">Sugerencia IA</h4>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Problema / Oportunidad</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="p-3 bg-muted/50 rounded-md text-sm">
                      {enrichmentData.original.problemStatement || <em className="text-muted-foreground">Sin datos</em>}
                    </div>
                    <div className="p-3 bg-primary/5 rounded-md text-sm border border-primary/20">
                      {enrichmentData.suggestion.problemStatement}
                    </div>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Qué SÍ incluye (Alcance)</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="p-3 bg-muted/50 rounded-md text-sm">
                      {enrichmentData.original.scopeIn || <em className="text-muted-foreground">Sin datos</em>}
                    </div>
                    <div className="p-3 bg-primary/5 rounded-md text-sm border border-primary/20">
                      {enrichmentData.suggestion.scopeIn}
                    </div>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Qué NO incluye</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="p-3 bg-muted/50 rounded-md text-sm">
                      {enrichmentData.original.scopeOut || <em className="text-muted-foreground">Sin datos</em>}
                    </div>
                    <div className="p-3 bg-primary/5 rounded-md text-sm border border-primary/20">
                      {enrichmentData.suggestion.scopeOut}
                    </div>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Objetivo</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="p-3 bg-muted/50 rounded-md text-sm">
                      {enrichmentData.original.objective || <em className="text-muted-foreground">Sin datos</em>}
                    </div>
                    <div className="p-3 bg-primary/5 rounded-md text-sm border border-primary/20">
                      {enrichmentData.suggestion.objective}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEnrichDialogOpen(false);
                setEnrichmentData(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleApplyEnrichment}
              disabled={applyEnrichmentMutation.isPending}
            >
              {applyEnrichmentMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              Aplicar Sugerencias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
