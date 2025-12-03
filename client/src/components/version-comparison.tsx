import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  FileSpreadsheet,
  ArrowRight,
  Plus,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ExcelVersion, ChangeLog } from "@shared/schema";

interface VersionsResponse {
  versions: ExcelVersion[];
}

interface ComparisonResponse {
  changes: ChangeLog[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
  };
  fromVersion: ExcelVersion;
  toVersion: ExcelVersion;
}

export function VersionComparison() {
  const [fromVersionId, setFromVersionId] = useState<string>("");
  const [toVersionId, setToVersionId] = useState<string>("");
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());

  const { data: versionsData, isLoading: isLoadingVersions } = useQuery<VersionsResponse>({
    queryKey: ["/api/versions"],
  });

  const { data: comparisonData, isLoading: isLoadingComparison } = useQuery<ComparisonResponse>({
    queryKey: ["/api/versions/compare", fromVersionId, toVersionId],
    enabled: !!fromVersionId && !!toVersionId && fromVersionId !== toVersionId,
  });

  const versions = versionsData?.versions || [];

  const toggleProject = (projectId: number) => {
    const newSet = new Set(expandedProjects);
    if (newSet.has(projectId)) {
      newSet.delete(projectId);
    } else {
      newSet.add(projectId);
    }
    setExpandedProjects(newSet);
  };

  // Group changes by project
  const changesByProject = comparisonData?.changes.reduce((acc, change) => {
    const key = change.projectId || -1;
    if (!acc[key]) {
      acc[key] = {
        projectId: change.projectId,
        projectName: change.projectName || "Proyecto desconocido",
        legacyId: change.legacyId,
        changes: [],
      };
    }
    acc[key].changes.push(change);
    return acc;
  }, {} as Record<number, { projectId: number | null; projectName: string; legacyId: string | null; changes: ChangeLog[] }>) || {};

  const formatDate = (date: string | Date) => {
    try {
      return format(new Date(date), "dd MMM yyyy HH:mm", { locale: es });
    } catch {
      return String(date);
    }
  };

  return (
    <div className="space-y-6">
      {/* Version Selector */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4" />
            Comparar Versiones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 w-full">
              <label className="text-xs text-muted-foreground mb-1 block">
                Versión anterior
              </label>
              <Select value={fromVersionId} onValueChange={setFromVersionId}>
                <SelectTrigger data-testid="select-from-version">
                  <SelectValue placeholder="Seleccionar versión" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingVersions ? (
                    <div className="p-2">
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : (
                    versions.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4" />
                          <span>v{v.id}: {v.fileName}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <ArrowRight className="h-5 w-5 text-muted-foreground hidden sm:block" />

            <div className="flex-1 w-full">
              <label className="text-xs text-muted-foreground mb-1 block">
                Versión actual
              </label>
              <Select value={toVersionId} onValueChange={setToVersionId}>
                <SelectTrigger data-testid="select-to-version">
                  <SelectValue placeholder="Seleccionar versión" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingVersions ? (
                    <div className="p-2">
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : (
                    versions.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4" />
                          <span>v{v.id}: {v.fileName}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {fromVersionId && toVersionId && fromVersionId !== toVersionId && (
        <>
          {isLoadingComparison ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : comparisonData ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="overflow-visible border-l-4 border-l-traffic-green">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-traffic-green/10 flex items-center justify-center">
                        <Plus className="h-5 w-5 text-traffic-green" />
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">{comparisonData.summary.added}</p>
                        <p className="text-sm text-muted-foreground">Proyectos agregados</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-visible border-l-4 border-l-traffic-yellow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-traffic-yellow/10 flex items-center justify-center">
                        <RefreshCw className="h-5 w-5 text-traffic-yellow" />
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">{comparisonData.summary.modified}</p>
                        <p className="text-sm text-muted-foreground">Cambios realizados</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-visible border-l-4 border-l-traffic-red">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-traffic-red/10 flex items-center justify-center">
                        <Minus className="h-5 w-5 text-traffic-red" />
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">{comparisonData.summary.deleted}</p>
                        <p className="text-sm text-muted-foreground">Proyectos eliminados</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Changes by Project */}
              <Card className="overflow-visible">
                <CardHeader>
                  <CardTitle className="text-base">Detalle de Cambios</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {Object.keys(changesByProject).length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">
                      No se encontraron diferencias entre las versiones seleccionadas
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {Object.values(changesByProject).map((group) => (
                        <Collapsible
                          key={group.projectId || group.legacyId}
                          open={expandedProjects.has(group.projectId || 0)}
                          onOpenChange={() => toggleProject(group.projectId || 0)}
                        >
                          <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <Badge
                                variant={
                                  group.changes[0]?.changeType === "added"
                                    ? "default"
                                    : group.changes[0]?.changeType === "deleted"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="w-20 justify-center"
                              >
                                {group.changes[0]?.changeType === "added" && "Nuevo"}
                                {group.changes[0]?.changeType === "modified" && "Modificado"}
                                {group.changes[0]?.changeType === "deleted" && "Eliminado"}
                              </Badge>
                              <div className="text-left">
                                <p className="font-medium">{group.projectName}</p>
                                {group.legacyId && (
                                  <p className="text-xs text-muted-foreground font-mono">
                                    ID: {group.legacyId}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {group.changes.length} cambio{group.changes.length !== 1 ? "s" : ""}
                              </Badge>
                              {expandedProjects.has(group.projectId || 0) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-4 pb-4 space-y-2">
                              {group.changes.map((change) => (
                                <div
                                  key={change.id}
                                  className={cn(
                                    "p-3 rounded-md border text-sm",
                                    change.changeType === "added" && "bg-traffic-green/5 border-traffic-green/20",
                                    change.changeType === "modified" && "bg-traffic-yellow/5 border-traffic-yellow/20",
                                    change.changeType === "deleted" && "bg-traffic-red/5 border-traffic-red/20"
                                  )}
                                  data-testid={`change-${change.id}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="space-y-1">
                                      <p className="font-medium">
                                        {change.fieldName || "Registro completo"}
                                      </p>
                                      {change.changeType === "modified" && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                          <span className="line-through">{change.oldValue || "(vacío)"}</span>
                                          <ArrowRight className="h-3 w-3" />
                                          <span className="text-foreground">{change.newValue || "(vacío)"}</span>
                                        </div>
                                      )}
                                      {change.changeType === "added" && change.newValue && (
                                        <p className="text-muted-foreground">{change.newValue}</p>
                                      )}
                                      {change.changeType === "deleted" && change.oldValue && (
                                        <p className="text-muted-foreground line-through">{change.oldValue}</p>
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                      {formatDate(change.changedAt)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}

      {/* Version History List */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            Historial de Versiones
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingVersions ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No hay versiones cargadas
            </div>
          ) : (
            <div className="divide-y divide-border">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  className="p-4 flex items-center justify-between gap-4"
                  data-testid={`version-row-${version.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{version.fileName}</p>
                        {index === 0 && (
                          <Badge variant="default" className="text-xs">
                            Actual
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(version.uploadedAt)} · {version.processedRows} filas
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      version.status === "completed"
                        ? "secondary"
                        : version.status === "error"
                        ? "destructive"
                        : "outline"
                    }
                  >
                    {version.status === "completed" && "Completado"}
                    {version.status === "processing" && "Procesando"}
                    {version.status === "pending" && "Pendiente"}
                    {version.status === "error" && "Error"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
