import { useQuery } from "@tanstack/react-query";
import { Search, Filter, X, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFilters } from "@/contexts/filter-context";
import type { Project } from "@shared/schema";
import { useMemo } from "react";

interface ProjectsResponse {
  projects: Project[];
  total: number;
}

interface FilterBarProps {
  showResultCount?: boolean;
  resultCount?: number;
  className?: string;
}

export function FilterBar({ showResultCount = false, resultCount, className }: FilterBarProps) {
  const { filters, setFilter, clearFilters, hasActiveFilters } = useFilters();

  const { data } = useQuery<ProjectsResponse>({
    queryKey: ["/api/projects"],
  });

  const { statuses, departments, businessProcessAnalysts } = useMemo(() => {
    if (!data?.projects) return { statuses: [], departments: [], businessProcessAnalysts: [] };
    
    const statusSet = new Set<string>();
    const deptSet = new Set<string>();
    const analystSet = new Set<string>();
    
    data.projects.forEach((p) => {
      if (p.status) statusSet.add(p.status);
      if (p.departmentName) deptSet.add(p.departmentName);
      
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
      businessProcessAnalysts: Array.from(analystSet).sort(),
    };
  }, [data?.projects]);

  return (
    <div className={className}>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar proyectos..."
            value={filters.q}
            onChange={(e) => setFilter("q", e.target.value)}
            className="pl-9"
            data-testid="input-global-search"
          />
        </div>
        
        <Select
          value={filters.estado}
          onValueChange={(value) => setFilter("estado", value)}
        >
          <SelectTrigger className="w-full sm:w-40" data-testid="select-global-status">
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
          value={filters.depto}
          onValueChange={(value) => setFilter("depto", value)}
        >
          <SelectTrigger className="w-full sm:w-48" data-testid="select-global-department">
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

        <Select
          value={filters.analista}
          onValueChange={(value) => setFilter("analista", value)}
        >
          <SelectTrigger className="w-full sm:w-52" data-testid="select-global-analyst">
            <User className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Business Analyst" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los analistas</SelectItem>
            {businessProcessAnalysts.map((analyst) => (
              <SelectItem key={analyst} value={analyst}>
                {analyst}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearFilters}
            data-testid="button-clear-global-filters"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {(showResultCount || hasActiveFilters) && (
        <div className="flex items-center justify-between mt-3">
          {showResultCount && resultCount !== undefined && (
            <p className="text-sm text-muted-foreground">
              {resultCount} proyecto{resultCount !== 1 ? "s" : ""} encontrado{resultCount !== 1 ? "s" : ""}
            </p>
          )}
          {hasActiveFilters && (
            <div className="flex gap-2 flex-wrap">
              {filters.q && (
                <Badge variant="secondary" className="gap-1">
                  Búsqueda: {filters.q}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setFilter("q", "")}
                  />
                </Badge>
              )}
              {filters.estado !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  Estado: {filters.estado}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setFilter("estado", "all")}
                  />
                </Badge>
              )}
              {filters.depto !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  Dpto: {filters.depto}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setFilter("depto", "all")}
                  />
                </Badge>
              )}
              {filters.analista !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  Analista: {filters.analista}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setFilter("analista", "all")}
                  />
                </Badge>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
