import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
  X,
  ArrowUpDown,
  Eye,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { TrafficLight, calculateTrafficLight } from "./traffic-light";
import { ProjectDetailDrawer } from "./project-detail-drawer";
import type { Project, ProjectUpdate, Milestone, ChangeLog } from "@shared/schema";
import { cn } from "@/lib/utils";

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

type SortField = "projectName" | "departmentName" | "status" | "endDateEstimated" | "percentComplete";
type SortDirection = "asc" | "desc";

export function ProjectsGrid() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("projectName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, error } = useQuery<ProjectsResponse>({
    queryKey: ["/api/projects"],
  });

  const { data: projectDetail, isLoading: isLoadingDetail } = useQuery<ProjectDetailResponse>({
    queryKey: ["/api/projects", selectedProjectId],
    enabled: !!selectedProjectId,
  });

  // Extract unique statuses and departments for filters
  const { statuses, departments } = useMemo(() => {
    if (!data?.projects) return { statuses: [], departments: [] };
    
    const statusSet = new Set<string>();
    const deptSet = new Set<string>();
    
    data.projects.forEach((p) => {
      if (p.status) statusSet.add(p.status);
      if (p.departmentName) deptSet.add(p.departmentName);
    });
    
    return {
      statuses: Array.from(statusSet).sort(),
      departments: Array.from(deptSet).sort(),
    };
  }, [data?.projects]);

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    if (!data?.projects) return [];

    let filtered = data.projects.filter((project) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          project.projectName?.toLowerCase().includes(searchLower) ||
          project.responsible?.toLowerCase().includes(searchLower) ||
          project.departmentName?.toLowerCase().includes(searchLower) ||
          project.legacyId?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== "all" && project.status !== statusFilter) {
        return false;
      }

      // Department filter
      if (departmentFilter !== "all" && project.departmentName !== departmentFilter) {
        return false;
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
  }, [data?.projects, search, statusFilter, departmentFilter, sortField, sortDirection]);

  // Paginate
  const paginatedProjects = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, page, pageSize]);

  const totalPages = Math.ceil(filteredProjects.length / pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setPage(1);
  };

  const hasActiveFilters = search || statusFilter !== "all" || departmentFilter !== "all";

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "dd/MM/yy", { locale: es });
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
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar proyectos..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
            data-testid="input-search-projects"
          />
        </div>
        
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={departmentFilter}
          onValueChange={(value) => {
            setDepartmentFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48" data-testid="select-department-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Departamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los dptos.</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearFilters}
            data-testid="button-clear-filters"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredProjects.length} proyecto{filteredProjects.length !== 1 ? "s" : ""} encontrado{filteredProjects.length !== 1 ? "s" : ""}
        </p>
        {hasActiveFilters && (
          <div className="flex gap-2">
            {search && (
              <Badge variant="secondary" className="gap-1">
                Búsqueda: {search}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setSearch("")}
                />
              </Badge>
            )}
            {statusFilter !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Estado: {statusFilter}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setStatusFilter("all")}
                />
              </Badge>
            )}
            {departmentFilter !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Dpto: {departmentFilter}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setDepartmentFilter("all")}
                />
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10"></TableHead>
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
              <TableHead>
                <button
                  className="flex items-center font-medium hover:text-foreground"
                  onClick={() => handleSort("departmentName")}
                  data-testid="sort-department"
                >
                  Departamento
                  <SortIcon field="departmentName" />
                </button>
              </TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>
                <button
                  className="flex items-center font-medium hover:text-foreground"
                  onClick={() => handleSort("status")}
                  data-testid="sort-status"
                >
                  Estado
                  <SortIcon field="status" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  className="flex items-center font-medium hover:text-foreground"
                  onClick={() => handleSort("endDateEstimated")}
                  data-testid="sort-end-date"
                >
                  Fecha Fin
                  <SortIcon field="endDateEstimated" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  className="flex items-center font-medium hover:text-foreground"
                  onClick={() => handleSort("percentComplete")}
                  data-testid="sort-progress"
                >
                  Avance
                  <SortIcon field="percentComplete" />
                </button>
              </TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-3 w-3 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-2 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : paginatedProjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No se encontraron proyectos
                </TableCell>
              </TableRow>
            ) : (
              paginatedProjects.map((project) => {
                const trafficLight = calculateTrafficLight(
                  project.endDateEstimated,
                  project.endDateEstimatedTbd,
                  project.status
                );
                
                return (
                  <TableRow
                    key={project.id}
                    className={cn(
                      "hover-elevate cursor-pointer",
                      selectedProjectId === project.id && "bg-muted/50"
                    )}
                    onClick={() => setSelectedProjectId(project.id)}
                    data-testid={`project-row-${project.id}`}
                  >
                    <TableCell>
                      <TrafficLight status={trafficLight} size="sm" />
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {project.projectName}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[120px] truncate">
                      {project.departmentName || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[120px] truncate">
                      {project.responsible || "—"}
                    </TableCell>
                    <TableCell>
                      {project.status ? (
                        <Badge variant="secondary" className="font-normal">
                          {project.status}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {project.endDateEstimatedTbd ? (
                        <Badge variant="outline" className="text-xs font-normal">TBD</Badge>
                      ) : (
                        formatDate(project.endDateEstimated)
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${project.percentComplete || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-8">
                          {project.percentComplete || 0}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
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
    </div>
  );
}
