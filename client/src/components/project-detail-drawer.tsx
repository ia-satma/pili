import { format } from "date-fns";
import { es } from "date-fns/locale";
import { X, Calendar, User, Building2, Flag, Clock, FileText, ChevronDown, Hash, Users, Briefcase, MessageSquare, AlertTriangle, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrafficLight, calculateTrafficLight, getDaysUntilDue } from "./traffic-light";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Project, ProjectUpdate, Milestone, ChangeLog } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ProjectDetailDrawerProps {
  project: Project | null;
  updates?: ProjectUpdate[];
  milestones?: Milestone[];
  changeLogs?: ChangeLog[];
  onClose: () => void;
  isOpen: boolean;
}

export function ProjectDetailDrawer({
  project,
  updates = [],
  milestones = [],
  changeLogs = [],
  onClose,
  isOpen,
}: ProjectDetailDrawerProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    description: true,
    scope: false,
    benefits: false,
    risks: false,
  });

  if (!isOpen || !project) return null;

  const trafficLight = calculateTrafficLight(
    project.endDateEstimated,
    project.endDateEstimatedTbd,
    project.status,
    project.estatusAlDia
  );

  const daysUntilDue = getDaysUntilDue(project.endDateEstimated);

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "—";
    try {
      // Add T12:00:00 to avoid timezone issues with date-only strings
      const dateStr = date.includes("T") ? date : `${date}T12:00:00`;
      return format(new Date(dateStr), "dd MMM yyyy", { locale: es });
    } catch {
      return date;
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
        onClick={onClose}
        data-testid="drawer-backdrop"
      />
      
      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full w-full max-w-lg bg-background border-l border-border z-50 shadow-xl"
        data-testid="project-detail-drawer"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <TrafficLight status={trafficLight} size="lg" />
                <h2 className="text-lg font-semibold tracking-tight truncate">
                  {project.projectName}
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {project.status && (
                  <Badge variant="secondary" className="text-xs">
                    {project.status}
                  </Badge>
                )}
                {project.priority && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      project.priority.toLowerCase() === "high" && "border-traffic-red text-traffic-red",
                      project.priority.toLowerCase() === "medium" && "border-traffic-yellow text-traffic-yellow",
                      project.priority.toLowerCase() === "low" && "border-traffic-green text-traffic-green"
                    )}
                  >
                    {project.priority}
                  </Badge>
                )}
                {/* Show estatusAlDia if available, otherwise show days */}
                {project.estatusAlDia ? (
                  <span className={cn(
                    "text-xs",
                    trafficLight === "green" && "text-traffic-green",
                    trafficLight === "red" && "text-traffic-red",
                    trafficLight === "yellow" && "text-traffic-yellow",
                    trafficLight === "gray" && "text-muted-foreground"
                  )}>
                    {project.estatusAlDia}
                  </span>
                ) : daysUntilDue !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {daysUntilDue >= 0
                      ? `${daysUntilDue} días restantes`
                      : `${Math.abs(daysUntilDue)} días de retraso`}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-drawer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="h-[calc(100%-80px)]">
          <Tabs defaultValue="overview" className="w-full">
            <div className="sticky top-0 bg-background z-10 px-6 pt-4">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="overview" data-testid="tab-overview">General</TabsTrigger>
                <TabsTrigger value="timeline" data-testid="tab-timeline">S/N</TabsTrigger>
                <TabsTrigger value="milestones" data-testid="tab-milestones">Hitos</TabsTrigger>
                <TabsTrigger value="history" data-testid="tab-history">Historial</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="px-6 py-4 space-y-6">
              {/* Identificación */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Identificación</h4>
                <div className="grid grid-cols-2 gap-4">
                  {project.legacyId && (
                    <div className="space-y-1" data-testid="field-legacy-id">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Hash className="h-3 w-3" />
                        <span>ID / Ranking</span>
                      </div>
                      <p className="text-sm font-medium">{project.legacyId}</p>
                    </div>
                  )}
                  <div className="space-y-1" data-testid="field-estatus-al-dia">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Estatus al Día</span>
                    </div>
                    <p className={cn(
                      "text-sm font-medium",
                      trafficLight === "green" && "text-traffic-green",
                      trafficLight === "red" && "text-traffic-red",
                      trafficLight === "yellow" && "text-traffic-yellow"
                    )}>
                      {project.estatusAlDia || "—"}
                    </p>
                  </div>
                  <div className="space-y-1" data-testid="field-status">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      <span>Tipo de Iniciativa / Fase</span>
                    </div>
                    <p className="text-sm font-medium">{project.status || "—"}</p>
                  </div>
                  {project.projectType && (
                    <div className="space-y-1" data-testid="field-project-type">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Briefcase className="h-3 w-3" />
                        <span>Tipo de Proyecto</span>
                      </div>
                      <p className="text-sm font-medium">{project.projectType}</p>
                    </div>
                  )}
                  {project.category && (
                    <div className="space-y-1" data-testid="field-category">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        <span>Categoría</span>
                      </div>
                      <p className="text-sm font-medium">{project.category}</p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Responsables */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Responsables</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1" data-testid="field-responsible">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>Líder / Solicitante</span>
                    </div>
                    <p className="text-sm font-medium">{project.responsible || "—"}</p>
                  </div>
                  <div className="space-y-1" data-testid="field-sponsor">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>Dueño del Proceso / Sponsor</span>
                    </div>
                    <p className="text-sm font-medium">{project.sponsor || "—"}</p>
                  </div>
                  <div className="space-y-1" data-testid="field-department">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      <span>Proceso de Negocio / Área</span>
                    </div>
                    <p className="text-sm font-medium">{project.departmentName || "—"}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Fechas */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fechas</h4>
                <div className="grid grid-cols-2 gap-4">
                  {project.registrationDate && (
                    <div className="space-y-1" data-testid="field-registration-date">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>Fecha de Registro</span>
                      </div>
                      <p className="text-sm font-medium">{formatDate(project.registrationDate)}</p>
                    </div>
                  )}
                  <div className="space-y-1" data-testid="field-start-date">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>Fecha Inicio</span>
                    </div>
                    <p className="text-sm font-medium">{formatDate(project.startDate)}</p>
                  </div>
                  <div className="space-y-1" data-testid="field-end-date-estimated">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Flag className="h-3 w-3" />
                      <span>Fecha Término Estimada</span>
                    </div>
                    <p className="text-sm font-medium">
                      {project.endDateEstimatedTbd ? "TBD" : formatDate(project.endDateEstimated)}
                    </p>
                  </div>
                  {project.endDateActual && (
                    <div className="space-y-1" data-testid="field-end-date-actual">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Flag className="h-3 w-3" />
                        <span>Fecha Término Real</span>
                      </div>
                      <p className="text-sm font-medium">{formatDate(project.endDateActual)}</p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Avance */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avance</h4>
                <div className="space-y-1" data-testid="field-progress">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>% Avance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${project.percentComplete || 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {project.percentComplete || 0}%
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Collapsible Sections */}
              {project.description && (
                <Collapsible
                  open={expandedSections.description}
                  onOpenChange={() => toggleSection("description")}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover-elevate rounded-md px-2 -mx-2">
                    <span>Descripción</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        expandedSections.description && "rotate-180"
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                      {project.description}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {project.scope && (
                <Collapsible
                  open={expandedSections.scope}
                  onOpenChange={() => toggleSection("scope")}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover-elevate rounded-md px-2 -mx-2">
                    <span>Alcance</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        expandedSections.scope && "rotate-180"
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                      {project.scope}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {project.benefits && (
                <Collapsible
                  open={expandedSections.benefits}
                  onOpenChange={() => toggleSection("benefits")}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover-elevate rounded-md px-2 -mx-2">
                    <span>Beneficios</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        expandedSections.benefits && "rotate-180"
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                      {project.benefits}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {project.risks && (
                <Collapsible
                  open={expandedSections.risks}
                  onOpenChange={() => toggleSection("risks")}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover-elevate rounded-md px-2 -mx-2">
                    <span>Riesgos</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        expandedSections.risks && "rotate-180"
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                      {project.risks}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Latest S/N */}
              {(project.parsedStatus || project.parsedNextSteps) && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Última Actualización (S/N)</h4>
                    {project.parsedStatus && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-primary">S: Status</span>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {project.parsedStatus}
                        </p>
                      </div>
                    )}
                    {project.parsedNextSteps && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-primary">N: Next Steps</span>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {project.parsedNextSteps}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Comentarios */}
              {project.comments && (
                <>
                  <Separator />
                  <div className="space-y-2" data-testid="field-comments">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      <span className="font-medium uppercase tracking-wider">Comentarios</span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {project.comments}
                    </p>
                  </div>
                </>
              )}

              {/* Extra Fields from Excel */}
              {project.extraFields && Object.keys(project.extraFields).length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3" data-testid="extra-fields-section">
                    <div className="flex items-center gap-2">
                      <Database className="h-3 w-3 text-muted-foreground" />
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Datos Adicionales del Excel
                      </h4>
                    </div>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {Object.entries(project.extraFields as Record<string, unknown>)
                        .filter(([key]) => 
                          !key.includes("ESTATUS AL DÍA") && // Already shown above
                          !key.includes("ESTATUS Y SIGUIENTES PASOS") // Already parsed as S/N
                        )
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([key, value]) => {
                          const displayValue = value === null || value === undefined || value === ""
                            ? "—"
                            : typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value);
                          return (
                            <div 
                              key={key} 
                              className="grid grid-cols-[1fr_2fr] gap-2 py-1 border-b border-border/50 last:border-0"
                              data-testid={`extra-field-${key.replace(/\s+/g, "-").toLowerCase()}`}
                            >
                              <span className="text-xs text-muted-foreground truncate" title={key}>
                                {key}
                              </span>
                              <span className={cn(
                                "text-xs break-words",
                                displayValue === "—" ? "text-muted-foreground" : "font-medium"
                              )}>
                                {displayValue}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="px-6 py-4">
              {updates.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No hay actualizaciones registradas</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
                  
                  <div className="space-y-6">
                    {updates.map((update, index) => (
                      <div key={update.id} className="relative pl-8" data-testid={`update-${update.id}`}>
                        {/* Timeline dot */}
                        <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        </div>
                        
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(update.updateDate), "dd MMM yyyy, HH:mm", { locale: es })}
                          </div>
                          
                          {update.statusText && (
                            <div className="space-y-1">
                              <span className="text-xs font-medium text-primary">S: Status</span>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {update.statusText}
                              </p>
                            </div>
                          )}
                          
                          {update.nextStepsText && (
                            <div className="space-y-1">
                              <span className="text-xs font-medium text-primary">N: Next Steps</span>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {update.nextStepsText}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="milestones" className="px-6 py-4">
              {milestones.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No hay hitos registrados</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {milestones.map((milestone) => {
                    const milestoneStatus = calculateTrafficLight(
                      milestone.dueDate,
                      milestone.dueDateTbd,
                      milestone.status
                    );
                    
                    return (
                      <div
                        key={milestone.id}
                        className="flex items-start gap-3 p-3 rounded-md border border-border"
                        data-testid={`milestone-${milestone.id}`}
                      >
                        <TrafficLight status={milestoneStatus} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{milestone.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {milestone.dueDateTbd ? "TBD" : formatDate(milestone.dueDate)}
                          </p>
                          {milestone.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {milestone.description}
                            </p>
                          )}
                        </div>
                        {milestone.status && (
                          <Badge variant="secondary" className="text-xs">
                            {milestone.status}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="px-6 py-4">
              {changeLogs.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No hay cambios registrados</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {changeLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-md border border-border space-y-1"
                      data-testid={`changelog-${log.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant={
                            log.changeType === "added"
                              ? "default"
                              : log.changeType === "deleted"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {log.changeType === "added" && "Agregado"}
                          {log.changeType === "modified" && "Modificado"}
                          {log.changeType === "deleted" && "Eliminado"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.changedAt), "dd/MM/yyyy HH:mm", { locale: es })}
                        </span>
                      </div>
                      {log.fieldName && (
                        <p className="text-sm">
                          <span className="font-medium">{log.fieldName}:</span>{" "}
                          {log.oldValue && (
                            <span className="text-muted-foreground line-through">{log.oldValue}</span>
                          )}{" "}
                          {log.oldValue && log.newValue && "→"}{" "}
                          {log.newValue && <span>{log.newValue}</span>}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </div>
    </>
  );
}
