import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type Row,
} from "@tanstack/react-table";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Save,
  X,
  AlertCircle,
  Check,
  RefreshCw,
  Download,
} from "lucide-react";
import type { Project } from "@shared/schema";

const STATUS_OPTIONS = ["No Iniciado", "En Progreso", "Completado", "En Espera", "Cancelado"] as const;
type StatusOption = typeof STATUS_OPTIONS[number];

const rowValidationSchema = z.object({
  projectName: z.string().min(1, "El nombre es requerido"),
  status: z.string().optional(),
  percentComplete: z.number().min(0, "Mínimo 0%").max(100, "Máximo 100%"),
  startDate: z.string().nullable().optional(),
  endDateEstimated: z.string().nullable().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDateEstimated) {
      return new Date(data.startDate) <= new Date(data.endDateEstimated);
    }
    return true;
  },
  {
    message: "La fecha de inicio no puede ser posterior a la fecha estimada de fin",
    path: ["endDateEstimated"],
  }
);

type EditingCell = {
  rowId: number;
  columnId: string;
} | null;

type CellValidationError = {
  rowId: number;
  columnId: string;
  message: string;
};

function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) : value;
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(num);
}

function parseCurrency(value: string): number | null {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/(?:^|\s)\w/g, (match) => match.toUpperCase());
}

function CurrencyCell({
  value,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  hasError,
  errorMessage,
}: {
  value: number | null;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (value: number | null) => void;
  onCancel: () => void;
  hasError?: boolean;
  errorMessage?: string;
}) {
  const [localValue, setLocalValue] = useState(value?.toString() || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setLocalValue(value?.toString() || "");
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSave(parseCurrency(localValue));
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleBlur = () => {
    onSave(parseCurrency(localValue));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9.-]/g, "");
    setLocalValue(val);
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn("h-8 text-sm", hasError && "border-destructive focus-visible:ring-destructive")}
        data-testid="input-currency-cell"
      />
    );
  }

  const content = (
    <div
      onClick={onEdit}
      className={cn(
        "px-2 py-1 cursor-pointer hover-elevate rounded min-h-[32px] flex items-center",
        hasError && "bg-destructive/10 border border-destructive rounded"
      )}
      data-testid="display-currency-cell"
    >
      {formatCurrency(value)}
    </div>
  );

  if (hasError && errorMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="bg-destructive text-destructive-foreground">
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {errorMessage}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function TextCell({
  value,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  hasError,
  errorMessage,
  autoCapitalize = true,
}: {
  value: string | null;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (value: string) => void;
  onCancel: () => void;
  hasError?: boolean;
  errorMessage?: string;
  autoCapitalize?: boolean;
}) {
  const [localValue, setLocalValue] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const formatted = autoCapitalize ? toTitleCase(localValue) : localValue.trim();
      onSave(formatted);
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleBlur = () => {
    const formatted = autoCapitalize ? toTitleCase(localValue) : localValue.trim();
    onSave(formatted);
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn("h-8 text-sm", hasError && "border-destructive focus-visible:ring-destructive")}
        data-testid="input-text-cell"
      />
    );
  }

  const content = (
    <div
      onClick={onEdit}
      className={cn(
        "px-2 py-1 cursor-pointer hover-elevate rounded min-h-[32px] flex items-center truncate",
        hasError && "bg-destructive/10 border border-destructive rounded"
      )}
      data-testid="display-text-cell"
    >
      {value || <span className="text-muted-foreground italic">Vacío</span>}
    </div>
  );

  if (hasError && errorMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="bg-destructive text-destructive-foreground">
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {errorMessage}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function StatusCell({
  value,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  hasError,
  errorMessage,
}: {
  value: string | null;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (value: string) => void;
  onCancel: () => void;
  hasError?: boolean;
  errorMessage?: string;
}) {
  const handleChange = (newValue: string) => {
    onSave(newValue);
  };

  const statusColor = useMemo(() => {
    const lower = (value || "").toLowerCase();
    if (lower.includes("completado") || lower.includes("done") || lower.includes("cerrado")) {
      return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
    }
    if (lower.includes("progreso") || lower.includes("progress")) {
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";
    }
    if (lower.includes("espera") || lower.includes("hold") || lower.includes("wait")) {
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    }
    if (lower.includes("cancelado") || lower.includes("cancelled")) {
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
    }
    return "bg-muted text-muted-foreground border-border";
  }, [value]);

  if (isEditing) {
    return (
      <Select value={value || ""} onValueChange={handleChange}>
        <SelectTrigger className="h-8 text-sm" data-testid="select-status-cell">
          <SelectValue placeholder="Seleccionar..." />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const content = (
    <div onClick={onEdit} className="cursor-pointer" data-testid="display-status-cell">
      <Badge
        variant="outline"
        className={cn(
          "font-normal",
          statusColor,
          hasError && "border-destructive"
        )}
      >
        {value || "Sin Estado"}
      </Badge>
    </div>
  );

  if (hasError && errorMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="bg-destructive text-destructive-foreground">
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {errorMessage}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function PercentageCell({
  value,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  hasError,
  errorMessage,
}: {
  value: number | null;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (value: number) => void;
  onCancel: () => void;
  hasError?: boolean;
  errorMessage?: string;
}) {
  const [localValue, setLocalValue] = useState(value ?? 0);

  useEffect(() => {
    setLocalValue(value ?? 0);
  }, [value]);

  const handleSliderChange = (values: number[]) => {
    setLocalValue(values[0]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
    setLocalValue(val);
  };

  const handleSave = () => {
    onSave(localValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const progressColor = useMemo(() => {
    if (localValue >= 100) return "bg-green-500";
    if (localValue >= 75) return "bg-blue-500";
    if (localValue >= 50) return "bg-yellow-500";
    if (localValue >= 25) return "bg-orange-500";
    return "bg-red-500";
  }, [localValue]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 min-w-[180px]">
        <Slider
          value={[localValue]}
          onValueChange={handleSliderChange}
          max={100}
          step={1}
          className="flex-1"
          data-testid="slider-percentage-cell"
        />
        <Input
          type="number"
          min={0}
          max={100}
          value={localValue}
          onChange={handleInputChange}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-16 h-8 text-sm text-center"
          data-testid="input-percentage-cell"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    );
  }

  const content = (
    <div
      onClick={onEdit}
      className={cn(
        "cursor-pointer hover-elevate rounded px-2 py-1 min-h-[32px] flex items-center gap-2",
        hasError && "bg-destructive/10 border border-destructive"
      )}
      data-testid="display-percentage-cell"
    >
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all", progressColor)}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
      <span className="text-xs font-medium w-10 text-right">{value ?? 0}%</span>
    </div>
  );

  if (hasError && errorMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="bg-destructive text-destructive-foreground">
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {errorMessage}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function DateCell({
  value,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  hasError,
  errorMessage,
}: {
  value: string | null;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (value: string | null) => void;
  onCancel: () => void;
  hasError?: boolean;
  errorMessage?: string;
}) {
  const [localValue, setLocalValue] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSave(localValue || null);
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleBlur = () => {
    onSave(localValue || null);
  };

  const formatDisplayDate = (dateStr: string | null) => {
    if (!dateStr) return <span className="text-muted-foreground italic">Sin fecha</span>;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type="date"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn("h-8 text-sm", hasError && "border-destructive focus-visible:ring-destructive")}
        data-testid="input-date-cell"
      />
    );
  }

  const content = (
    <div
      onClick={onEdit}
      className={cn(
        "px-2 py-1 cursor-pointer hover-elevate rounded min-h-[32px] flex items-center",
        hasError && "bg-destructive/10 border border-destructive rounded"
      )}
      data-testid="display-date-cell"
    >
      {formatDisplayDate(value)}
    </div>
  );

  if (hasError && errorMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="bg-destructive text-destructive-foreground">
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {errorMessage}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function ColumnFilter({
  column,
  type,
}: {
  column: any;
  type: "text" | "select" | "range" | "date";
}) {
  const filterValue = column.getFilterValue();

  if (type === "select") {
    return (
      <Select
        value={(filterValue as string) || "all"}
        onValueChange={(value) => column.setFilterValue(value === "all" ? undefined : value)}
      >
        <SelectTrigger className="h-7 text-xs" data-testid={`filter-select-${column.id}`}>
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (type === "range") {
    const [min, max] = (filterValue as [number, number]) || [0, 100];
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={100}
          value={min}
          onChange={(e) => column.setFilterValue([parseInt(e.target.value) || 0, max])}
          className="h-7 w-12 text-xs"
          placeholder="Min"
          data-testid={`filter-range-min-${column.id}`}
        />
        <span className="text-xs text-muted-foreground">-</span>
        <Input
          type="number"
          min={0}
          max={100}
          value={max}
          onChange={(e) => column.setFilterValue([min, parseInt(e.target.value) || 100])}
          className="h-7 w-12 text-xs"
          placeholder="Max"
          data-testid={`filter-range-max-${column.id}`}
        />
      </div>
    );
  }

  if (type === "date") {
    return (
      <Input
        type="date"
        value={(filterValue as string) || ""}
        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
        className="h-7 text-xs"
        data-testid={`filter-date-${column.id}`}
      />
    );
  }

  return (
    <Input
      type="text"
      value={(filterValue as string) || ""}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder="Buscar..."
      className="h-7 text-xs"
      data-testid={`filter-text-${column.id}`}
    />
  );
}

export function SmartProjectGrid() {
  const { toast } = useToast();
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<number, Partial<Project>>>(new Map());
  const [validationErrors, setValidationErrors] = useState<CellValidationError[]>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

  const { data: projectsData, isLoading, refetch } = useQuery<{ projects: Project[] }>({
    queryKey: ["/api/projects"],
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Project> }) => {
      const response = await apiRequest("PATCH", `/api/projects/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Guardado",
        description: "Los cambios se han guardado correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al guardar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const projects = useMemo(() => {
    const baseProjects = projectsData?.projects || [];
    console.log("Grid Data Source:", baseProjects);
    return baseProjects.map((project) => ({
      ...project,
      ...pendingChanges.get(project.id),
    }));
  }, [projectsData?.projects, pendingChanges]);

  const validateRow = useCallback((rowData: Partial<Project>, rowId: number): CellValidationError[] => {
    const errors: CellValidationError[] = [];
    const result = rowValidationSchema.safeParse(rowData);

    if (!result.success) {
      result.error.errors.forEach((err) => {
        const path = err.path[0] as string;
        errors.push({
          rowId,
          columnId: path,
          message: err.message,
        });
      });
    }

    return errors;
  }, []);

  const handleCellEdit = useCallback((rowId: number, columnId: string) => {
    setEditingCell({ rowId, columnId });
  }, []);

  const handleCellSave = useCallback((rowId: number, columnId: string, value: any) => {
    setEditingCell(null);

    const currentProject = projects.find((p) => p.id === rowId);
    if (!currentProject) return;

    const currentValue = currentProject[columnId as keyof Project];
    if (currentValue === value) return;

    const updatedPending = new Map(pendingChanges);
    const existingChanges = updatedPending.get(rowId) || {};
    updatedPending.set(rowId, { ...existingChanges, [columnId]: value });
    setPendingChanges(updatedPending);

    const rowData = { ...currentProject, ...existingChanges, [columnId]: value };
    const errors = validateRow(rowData, rowId);

    setValidationErrors((prev) => [
      ...prev.filter((e) => e.rowId !== rowId),
      ...errors,
    ]);
  }, [projects, pendingChanges, validateRow]);

  const handleCellCancel = useCallback(() => {
    setEditingCell(null);
  }, []);

  const hasRowErrors = useCallback((rowId: number) => {
    return validationErrors.some((e) => e.rowId === rowId);
  }, [validationErrors]);

  const getCellError = useCallback((rowId: number, columnId: string) => {
    return validationErrors.find((e) => e.rowId === rowId && e.columnId === columnId);
  }, [validationErrors]);

  const saveRow = useCallback(async (rowId: number) => {
    if (hasRowErrors(rowId)) {
      toast({
        title: "Error de validación",
        description: "Corrige los errores antes de guardar.",
        variant: "destructive",
      });
      return;
    }

    const changes = pendingChanges.get(rowId);
    if (!changes) return;

    await updateProjectMutation.mutateAsync({ id: rowId, data: changes });

    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.delete(rowId);
      return next;
    });
  }, [pendingChanges, hasRowErrors, updateProjectMutation, toast]);

  const discardRowChanges = useCallback((rowId: number) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.delete(rowId);
      return next;
    });
    setValidationErrors((prev) => prev.filter((e) => e.rowId !== rowId));
  }, []);

  const columnHelper = createColumnHelper<Project>();

  const columns = useMemo<ColumnDef<Project, any>[]>(
    () => [
      columnHelper.accessor("legacyId", {
        header: "ID",
        cell: (info) => (
          <span className="text-xs text-muted-foreground font-mono" data-testid={`cell-project-id-${info.row.original.id}`}>
            {info.getValue() || "-"}
          </span>
        ),
        size: 100,
        filterFn: "includesString",
        meta: { filterType: "text" },
      }),
      columnHelper.accessor("projectName", {
        header: "Nombre",
        cell: ({ row, getValue }) => {
          const rowId = row.original.id;
          const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === "projectName";
          const error = getCellError(rowId, "projectName");

          return (
            <TextCell
              value={getValue()}
              isEditing={isEditing}
              onEdit={() => handleCellEdit(rowId, "projectName")}
              onSave={(val) => handleCellSave(rowId, "projectName", val)}
              onCancel={handleCellCancel}
              hasError={!!error}
              errorMessage={error?.message}
              autoCapitalize={true}
            />
          );
        },
        size: 240,
        filterFn: "includesString",
        meta: { filterType: "text" },
      }),
      columnHelper.accessor("departmentName", {
        header: "Área",
        cell: ({ row, getValue }) => {
          const rowId = row.original.id;
          const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === "departmentName";
          const error = getCellError(rowId, "departmentName");

          return (
            <TextCell
              value={getValue()}
              isEditing={isEditing}
              onEdit={() => handleCellEdit(rowId, "departmentName")}
              onSave={(val) => handleCellSave(rowId, "departmentName", val)}
              onCancel={handleCellCancel}
              hasError={!!error}
              errorMessage={error?.message}
              autoCapitalize={true}
            />
          );
        },
        size: 140,
        filterFn: "includesString",
        meta: { filterType: "text" },
      }),
      columnHelper.accessor("status", {
        header: "Estado",
        cell: ({ row, getValue }) => {
          const rowId = row.original.id;
          const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === "status";
          const error = getCellError(rowId, "status");

          return (
            <StatusCell
              value={getValue()}
              isEditing={isEditing}
              onEdit={() => handleCellEdit(rowId, "status")}
              onSave={(val) => handleCellSave(rowId, "status", val)}
              onCancel={handleCellCancel}
              hasError={!!error}
              errorMessage={error?.message}
            />
          );
        },
        size: 130,
        filterFn: (row, columnId, filterValue) => {
          if (!filterValue) return true;
          return row.getValue(columnId) === filterValue;
        },
        meta: { filterType: "select" },
      }),
      columnHelper.accessor("percentComplete", {
        header: "Avance",
        cell: ({ row, getValue }) => {
          const rowId = row.original.id;
          const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === "percentComplete";
          const error = getCellError(rowId, "percentComplete");

          return (
            <PercentageCell
              value={getValue()}
              isEditing={isEditing}
              onEdit={() => handleCellEdit(rowId, "percentComplete")}
              onSave={(val) => handleCellSave(rowId, "percentComplete", val)}
              onCancel={handleCellCancel}
              hasError={!!error}
              errorMessage={error?.message}
            />
          );
        },
        size: 180,
        filterFn: (row, columnId, filterValue) => {
          if (!filterValue) return true;
          const [min, max] = filterValue as [number, number];
          const value = row.getValue(columnId) as number;
          return value >= min && value <= max;
        },
        meta: { filterType: "range" },
      }),
      columnHelper.accessor("priority", {
        header: "Prioridad",
        cell: ({ row, getValue }) => {
          const value = getValue();
          const lower = (value || "").toLowerCase();
          let priorityColor = "bg-muted text-muted-foreground border-border";
          if (lower.includes("alta") || lower.includes("high")) {
            priorityColor = "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
          } else if (lower.includes("media") || lower.includes("medium")) {
            priorityColor = "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
          } else if (lower.includes("baja") || lower.includes("low")) {
            priorityColor = "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
          }

          return (
            <Badge
              variant="outline"
              className={cn("font-normal", priorityColor)}
              data-testid={`cell-priority-${row.original.id}`}
            >
              {value || "-"}
            </Badge>
          );
        },
        size: 100,
        filterFn: "includesString",
        meta: { filterType: "text" },
      }),
      columnHelper.accessor("responsible", {
        header: "Líder",
        cell: ({ row, getValue }) => {
          const rowId = row.original.id;
          const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === "responsible";
          const error = getCellError(rowId, "responsible");

          return (
            <TextCell
              value={getValue()}
              isEditing={isEditing}
              onEdit={() => handleCellEdit(rowId, "responsible")}
              onSave={(val) => handleCellSave(rowId, "responsible", val)}
              onCancel={handleCellCancel}
              hasError={!!error}
              errorMessage={error?.message}
              autoCapitalize={true}
            />
          );
        },
        size: 150,
        filterFn: "includesString",
        meta: { filterType: "text" },
      }),
      columnHelper.accessor("sponsor", {
        header: "Sponsor",
        cell: ({ row, getValue }) => {
          const rowId = row.original.id;
          const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === "sponsor";
          const error = getCellError(rowId, "sponsor");

          return (
            <TextCell
              value={getValue()}
              isEditing={isEditing}
              onEdit={() => handleCellEdit(rowId, "sponsor")}
              onSave={(val) => handleCellSave(rowId, "sponsor", val)}
              onCancel={handleCellCancel}
              hasError={!!error}
              errorMessage={error?.message}
              autoCapitalize={true}
            />
          );
        },
        size: 150,
        filterFn: "includesString",
        meta: { filterType: "text" },
      }),
      columnHelper.accessor("startDate", {
        header: "Inicio",
        cell: ({ row, getValue }) => {
          const rowId = row.original.id;
          const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === "startDate";
          const error = getCellError(rowId, "startDate");

          return (
            <DateCell
              value={getValue()}
              isEditing={isEditing}
              onEdit={() => handleCellEdit(rowId, "startDate")}
              onSave={(val) => handleCellSave(rowId, "startDate", val)}
              onCancel={handleCellCancel}
              hasError={!!error}
              errorMessage={error?.message}
            />
          );
        },
        size: 120,
        meta: { filterType: "date" },
      }),
      columnHelper.accessor("endDateEstimated", {
        header: "Fin Est.",
        cell: ({ row, getValue }) => {
          const rowId = row.original.id;
          const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === "endDateEstimated";
          const error = getCellError(rowId, "endDateEstimated");

          return (
            <DateCell
              value={getValue()}
              isEditing={isEditing}
              onEdit={() => handleCellEdit(rowId, "endDateEstimated")}
              onSave={(val) => handleCellSave(rowId, "endDateEstimated", val)}
              onCancel={handleCellCancel}
              hasError={!!error}
              errorMessage={error?.message}
            />
          );
        },
        size: 120,
        meta: { filterType: "date" },
      }),
      columnHelper.display({
        id: "budget",
        header: "Presupuesto",
        cell: ({ row }) => {
          const extraFields = row.original.extraFields as Record<string, unknown> | null;
          const budgetValue = extraFields?.["Presupuesto"] ?? extraFields?.["Budget"] ?? extraFields?.["budget"] ?? null;
          
          if (budgetValue === null || budgetValue === undefined || budgetValue === "") {
            return (
              <span className="text-muted-foreground" data-testid={`cell-budget-${row.original.id}`}>
                -
              </span>
            );
          }
          
          const numValue = typeof budgetValue === "number" 
            ? budgetValue 
            : typeof budgetValue === "string" 
              ? parseFloat(budgetValue.replace(/[^0-9.-]/g, ""))
              : null;
          
          if (numValue === null || isNaN(numValue)) {
            return (
              <span className="text-muted-foreground" data-testid={`cell-budget-${row.original.id}`}>
                {String(budgetValue)}
              </span>
            );
          }
          
          return (
            <span className="font-mono text-sm" data-testid={`cell-budget-${row.original.id}`}>
              {formatCurrency(numValue)}
            </span>
          );
        },
        size: 130,
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const rowId = row.original.id;
          const hasPending = pendingChanges.has(rowId);
          const hasErrors = hasRowErrors(rowId);

          if (!hasPending) return null;

          return (
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={hasErrors ? "destructive" : "default"}
                    className="h-7 w-7"
                    onClick={() => saveRow(rowId)}
                    disabled={hasErrors || updateProjectMutation.isPending}
                    data-testid={`button-save-row-${rowId}`}
                  >
                    {hasErrors ? <AlertCircle className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {hasErrors ? "Corrige los errores primero" : "Guardar cambios"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => discardRowChanges(rowId)}
                    data-testid={`button-discard-row-${rowId}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Descartar cambios</TooltipContent>
              </Tooltip>
            </div>
          );
        },
        size: 80,
      }),
    ],
    [editingCell, getCellError, handleCellEdit, handleCellSave, handleCellCancel, pendingChanges, hasRowErrors, saveRow, discardRowChanges, updateProjectMutation.isPending]
  );

  const table = useReactTable({
    data: projects,
    columns,
    state: {
      columnFilters,
      sorting,
    },
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const pendingCount = pendingChanges.size;
  const errorCount = new Set(validationErrors.map((e) => e.rowId)).size;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold text-lg">Proyectos</h2>
          <Badge variant="outline" className="font-normal">
            {table.getFilteredRowModel().rows.length} proyectos
          </Badge>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Save className="h-3 w-3" />
              {pendingCount} sin guardar
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              {errorCount} con errores
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1"
            data-testid="button-refresh-grid"
          >
            <RefreshCw className="h-3 w-3" />
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            data-testid="button-export-grid"
          >
            <Download className="h-3 w-3" />
            Exportar
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="min-w-max">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-background border-b border-border">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-2 py-2 text-left font-medium text-muted-foreground border-r border-border last:border-r-0"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn(
                            "flex items-center gap-1",
                            header.column.getCanSort() && "cursor-pointer select-none hover:text-foreground"
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <>
                              {header.column.getIsSorted() === "asc" && <ArrowUp className="h-3 w-3" />}
                              {header.column.getIsSorted() === "desc" && <ArrowDown className="h-3 w-3" />}
                              {!header.column.getIsSorted() && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                            </>
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
              <tr className="bg-muted/50 border-b border-border">
                {table.getHeaderGroups()[0]?.headers.map((header) => (
                  <th
                    key={`filter-${header.id}`}
                    className="px-2 py-1 border-r border-border last:border-r-0"
                    style={{ width: header.getSize() }}
                  >
                    {header.column.getCanFilter() && (
                      <ColumnFilter
                        column={header.column}
                        type={(header.column.columnDef.meta as any)?.filterType || "text"}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, index) => {
                const hasPending = pendingChanges.has(row.original.id);
                const hasErrors = hasRowErrors(row.original.id);

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border hover:bg-muted/30 transition-colors",
                      index % 2 === 0 ? "bg-background" : "bg-muted/10",
                      hasPending && !hasErrors && "bg-primary/5",
                      hasErrors && "bg-destructive/5"
                    )}
                    data-testid={`row-project-${row.original.id}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-2 py-1 border-r border-border last:border-r-0"
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
