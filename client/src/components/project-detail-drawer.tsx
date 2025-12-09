import { format } from "date-fns";
import { es } from "date-fns/locale";
import { X, Calendar, User, Building2, Flag, Clock, FileText, ChevronDown, Hash, Users, Briefcase, MessageSquare, AlertTriangle, Database, Target, DollarSign, GitBranch, Timer, MapPin, TrendingUp, Award, Zap, Lightbulb, AlertCircle, BarChart3, HelpCircle } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Project, ProjectUpdate, Milestone, ChangeLog } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useState } from "react";

function FieldLabelWithTooltip({ 
  icon: Icon, 
  label, 
  tooltip 
}: { 
  icon: React.ElementType; 
  label: string; 
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// PMO Field Categories - Using EXACT Excel column names
const PMO_FIELD_CATEGORIES: {
  id: string;
  title: string;
  icon: React.ElementType;
  patterns: string[];
}[] = [
  {
    id: "roles",
    title: "Gobierno y Roles",
    icon: Users,
    patterns: [
      "Black Belt Lead",
      "DTC Lead", 
      "Citizen Developer",
      "Business Process Analyst",
      "Grupo Técnico Asignado",
      "Dueño del Proceso",
      "Dirección de Negocio",
      "VP (5)",
      "Director (4)",
    ],
  },
  {
    id: "scoring",
    title: "Priorización y Scoring",
    icon: Target,
    patterns: [
      "Ranking",
      "Renking General",
      "Puntaje Total",
      "Total Valor",
      "Total Esfuerzo",
      "Previo",
      "Alto (1)",
      "Alto (5)",
      "Medio (3)",
      "Bajo (5)",
      "Bajo (1)",
      "Ninguna (5)",
      "> 500 (5)",
      "Cambio Menor",
      "Cambio Mayor",
      "Proyecto Menor",
      "Proyecto Mediano",
      "Proyecto Mayor",
    ],
  },
  {
    id: "financial",
    title: "Impacto Financiero",
    icon: DollarSign,
    patterns: [
      "Business Impact",
      "Beneficios Real YTD",
      "Arranque de Beneficios",
      "Fin de Beneficios",
      "Soft Savings",
      "KUSD",
      "Growth / year",
      "Costos",
      "Si < 5 KUSD",
      "Time, Control",
      "Compliance",
      "Quality of data",
    ],
  },
  {
    id: "status",
    title: "Estado y Fase",
    icon: Flag,
    patterns: [
      "Fase:",
      "Tipo de Iniciativa",
      "Acciones a ejecutar",
      "Ingresada en PBOT",
      "Transformación (5)",
      "Tranformación (5)",
      "Mejora completa",
      "Mejora parcial",
    ],
  },
  {
    id: "dependencies",
    title: "Dependencias",
    icon: GitBranch,
    patterns: [
      "Dependencias:",
      "IT Local",
      "T. Digital",
      "Digitalización",
      "SSC",
      "Externo",
    ],
  },
  {
    id: "timeline",
    title: "Tiempo y Ciclo",
    icon: Timer,
    patterns: [
      "T. de Ciclo",
      "Tiempo de Ciclo",
      "Más de 3 meses",
      "Entre 1 y 3 meses",
      "Menos de 1 mes",
      "Jan-", "Feb-", "Mar-", "Apr-", "May-", "Jun-",
      "Jul-", "Aug-", "Sep-", "Oct-", "Nov-", "Dec-",
    ],
  },
  {
    id: "scope",
    title: "Alcance y Región",
    icon: MapPin,
    patterns: [
      "Area de Productividad",
      "Área de Productividad",
      "PROCESO DE NEGOCIO",
      "Impacta a Gases",
      "Nlatam",
      "Nacional",
      "Local",
      "Valor / Diferenciador",
      "Si (5)",
      "Parcialmente (3)",
    ],
  },
];

// Fields to exclude (already shown in main sections)
const EXCLUDED_PATTERNS = [
  "ESTATUS AL DÍA",
  "ESTATUS Y SIGUIENTES PASOS",
  "__EMPTY",
];

function categorizeField(fieldName: string): string {
  const upperName = fieldName.toUpperCase();
  
  // Check exclusions first
  for (const pattern of EXCLUDED_PATTERNS) {
    if (upperName.includes(pattern.toUpperCase())) {
      return "excluded";
    }
  }
  
  // Find matching category
  for (const category of PMO_FIELD_CATEGORIES) {
    for (const pattern of category.patterns) {
      if (fieldName.includes(pattern) || upperName.includes(pattern.toUpperCase())) {
        return category.id;
      }
    }
  }
  
  return "other";
}

function ExtraFieldsSections({ extraFields }: { extraFields: Record<string, unknown> }) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    roles: true,
    scoring: true,
    financial: false,
    status: false,
    dependencies: false,
    timeline: false,
    scope: false,
    other: false,
  });

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  // Group fields by category
  const categorizedFields: Record<string, [string, unknown][]> = {};
  for (const [key, value] of Object.entries(extraFields)) {
    const category = categorizeField(key);
    if (category === "excluded") continue;
    if (!categorizedFields[category]) {
      categorizedFields[category] = [];
    }
    categorizedFields[category].push([key, value]);
  }

  // Sort fields within each category alphabetically
  for (const category of Object.keys(categorizedFields)) {
    categorizedFields[category].sort(([a], [b]) => a.localeCompare(b));
  }

  const renderFieldValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") {
      return <span className="text-muted-foreground">—</span>;
    }
    if (typeof value === "object") {
      return <span className="font-medium">{JSON.stringify(value)}</span>;
    }
    return <span className="font-medium">{String(value)}</span>;
  };

  const renderCategorySection = (category: typeof PMO_FIELD_CATEGORIES[0], fields: [string, unknown][]) => {
    if (fields.length === 0) return null;

    const Icon = category.icon;
    const isExpanded = expandedCategories[category.id];
    const nonEmptyCount = fields.filter(([_, v]) => v !== null && v !== undefined && v !== "").length;

    return (
      <Collapsible
        key={category.id}
        open={isExpanded}
        onOpenChange={() => toggleCategory(category.id)}
        data-testid={`category-${category.id}`}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover-elevate rounded-md px-2 -mx-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span>{category.title}</span>
            <Badge variant="secondary" className="text-xs">
              {nonEmptyCount}/{fields.length}
            </Badge>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-1 mt-2 pl-6">
            {fields.map(([key, value]) => (
              <div 
                key={key} 
                className="grid grid-cols-[1fr_1.5fr] gap-2 py-1 border-b border-border/30 last:border-0"
                data-testid={`field-${key.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <span className="text-xs text-muted-foreground" title={key}>
                  {key}
                </span>
                <span className="text-xs break-words">
                  {renderFieldValue(value)}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  // Render "Other" category for uncategorized fields
  const renderOtherCategory = () => {
    const otherFields = categorizedFields["other"];
    if (!otherFields || otherFields.length === 0) return null;

    const isExpanded = expandedCategories["other"];
    const nonEmptyCount = otherFields.filter(([_, v]) => v !== null && v !== undefined && v !== "").length;

    return (
      <Collapsible
        open={isExpanded}
        onOpenChange={() => toggleCategory("other")}
        data-testid="category-other"
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover-elevate rounded-md px-2 -mx-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span>Otros Campos</span>
            <Badge variant="secondary" className="text-xs">
              {nonEmptyCount}/{otherFields.length}
            </Badge>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-1 mt-2 pl-6">
            {otherFields.map(([key, value]) => (
              <div 
                key={key} 
                className="grid grid-cols-[1fr_1.5fr] gap-2 py-1 border-b border-border/30 last:border-0"
                data-testid={`field-${key.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <span className="text-xs text-muted-foreground" title={key}>
                  {key}
                </span>
                <span className="text-xs break-words">
                  {renderFieldValue(value)}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-2" data-testid="extra-fields-section">
      <div className="flex items-center gap-2 mb-3">
        <Database className="h-3 w-3 text-muted-foreground" />
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Campos del Excel
        </h4>
      </div>
      <div className="space-y-1 max-h-[500px] overflow-y-auto pr-2">
        {PMO_FIELD_CATEGORIES.map(category => {
          const fields = categorizedFields[category.id];
          if (!fields || fields.length === 0) return null;
          return renderCategorySection(category, fields);
        })}
        {renderOtherCategory()}
      </div>
    </div>
  );
}

// Scoring dimension definitions for parsing extraFields
const SCORING_VALUE_DIMENSIONS = [
  {
    id: "sponsor",
    label: "Nivel de Sponsor",
    patterns: ["VP (5)", "Director (4)", "Gerente (3)", "Supervisor (2)", "Usuario (1)"],
    maxScore: 5,
  },
  {
    id: "financial",
    label: "Impacto Financiero",
    patterns: ["Alto >300 KUSD (5)", "Alto (5)", "Medio (3)", "Bajo (1)", "Ninguno (0)"],
    maxScore: 5,
  },
  {
    id: "geographic",
    label: "Alcance Geográfico",
    patterns: ["Nlatam (5)", "Nacional (3)", "Local (1)", "No (0)"],
    maxScore: 5,
  },
  {
    id: "transformation",
    label: "Transformación",
    patterns: ["Transformación (5)", "Tranformación (5)", "Mejora completa (3)", "Mejora parcial (1)", "Ninguno (0)"],
    maxScore: 5,
  },
  {
    id: "users",
    label: "Volumen Usuarios",
    patterns: ["> 500 (5)", "300-500 (4)", "200-300 (3)", "100-200 (2)", "< 100 (1)"],
    maxScore: 5,
  },
];

const SCORING_EFFORT_DIMENSIONS = [
  {
    id: "size",
    label: "Tamaño Proyecto",
    patterns: ["Cambio Menor <=40hrs (5)", "Cambio Menor (5)", "Cambio Mayor (4)", "Proyecto Menor (3)", "Proyecto Mediano (2)", "Proyecto Mayor (1)"],
    maxScore: 5,
  },
  {
    id: "dependencies",
    label: "Dependencias",
    patterns: ["Ninguna (5)", "1 (4)", "2-5 (3)", "> 5 (1)"],
    maxScore: 5,
  },
  {
    id: "investment",
    label: "Inversión",
    patterns: ["No (5)", "Si < 5 KUSD (4)", "< 5 KUSD (4)", "5-20 KUSD (3)", "20-100 KUSD (2)", "> 100 KUSD (1)"],
    maxScore: 5,
  },
  {
    id: "time",
    label: "Tiempo Implementación",
    patterns: ["Menos de 1 mes (5)", "< 1 mes (5)", "Entre 1 y 3 meses (3)", "1-3 meses (3)", "Más de 3 meses (1)", "> 3 meses (1)"],
    maxScore: 5,
  },
];

function extractScore(value: string): number | null {
  const match = value.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : null;
}

function determineQuadrant(totalValor: number, totalEsfuerzo: number): {
  name: string;
  color: string;
  icon: React.ElementType;
  description: string;
} {
  // Thresholds based on actual data ranges (totalValor ~200-500, totalEsfuerzo ~180-525)
  const valorThreshold = 360; // ~median value from actual data
  const esfuerzoThreshold = 405; // ~median value from actual data
  
  const highValue = totalValor >= valorThreshold;
  const highEffort = totalEsfuerzo >= esfuerzoThreshold; // High effort score = low real effort
  
  if (highValue && highEffort) {
    return {
      name: "Quick Win",
      color: "bg-traffic-green/10 text-traffic-green border-traffic-green",
      icon: Zap,
      description: "Alto valor, bajo esfuerzo",
    };
  }
  if (highValue && !highEffort) {
    return {
      name: "Big Bet",
      color: "bg-blue-500/10 text-blue-500 border-blue-500",
      icon: Target,
      description: "Alto valor, alto esfuerzo",
    };
  }
  if (!highValue && highEffort) {
    return {
      name: "Fill-In",
      color: "bg-traffic-yellow/10 text-traffic-yellow border-traffic-yellow",
      icon: Lightbulb,
      description: "Bajo valor, bajo esfuerzo",
    };
  }
  return {
    name: "Money Pit",
    color: "bg-traffic-red/10 text-traffic-red border-traffic-red",
    icon: AlertCircle,
    description: "Bajo valor, alto esfuerzo",
  };
}

function ScoringBreakdownSection({ project }: { project: Project }) {
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);
  
  const extraFields = (project.extraFields || {}) as Record<string, unknown>;
  
  // Get scores from project columns or extraFields
  const totalValor = project.totalValor ?? (typeof extraFields["Total Valor"] === "number" ? extraFields["Total Valor"] : null);
  const totalEsfuerzo = project.totalEsfuerzo ?? (typeof extraFields["Total Esfuerzo"] === "number" ? extraFields["Total Esfuerzo"] : null);
  const puntajeTotal = project.puntajeTotal ?? (typeof extraFields["Puntaje Total"] === "number" ? extraFields["Puntaje Total"] : null);
  const ranking = project.ranking ?? (typeof extraFields["Ranking"] === "number" ? extraFields["Ranking"] : null);
  
  // If no scoring data available, don't render
  if (totalValor === null && totalEsfuerzo === null && puntajeTotal === null) {
    return null;
  }
  
  const quadrant = determineQuadrant(totalValor || 0, totalEsfuerzo || 0);
  const QuadrantIcon = quadrant.icon;
  
  // Parse dimension values from extraFields
  const parseDimensions = (dimensions: typeof SCORING_VALUE_DIMENSIONS) => {
    return dimensions.map((dim) => {
      for (const pattern of dim.patterns) {
        const fieldValue = extraFields[pattern];
        if (fieldValue !== undefined && fieldValue !== null && fieldValue !== "") {
          const score = extractScore(pattern);
          return {
            ...dim,
            selectedValue: String(fieldValue),
            selectedPattern: pattern,
            score,
          };
        }
      }
      // Check if any field key contains the pattern
      for (const [key, value] of Object.entries(extraFields)) {
        for (const pattern of dim.patterns) {
          if (key.includes(pattern) || (typeof value === "string" && value.includes(pattern))) {
            const score = extractScore(pattern);
            return {
              ...dim,
              selectedValue: String(value),
              selectedPattern: key,
              score,
            };
          }
        }
      }
      return { ...dim, selectedValue: null, selectedPattern: null, score: null };
    });
  };
  
  const valueDimensions = parseDimensions(SCORING_VALUE_DIMENSIONS);
  const effortDimensions = parseDimensions(SCORING_EFFORT_DIMENSIONS);
  
  // Based on actual Excel data, values are scaled (not raw 1-5 per dimension)
  // Total Valor max ~500, Total Esfuerzo max ~525, Puntaje Total max ~1000
  const maxValor = 500;
  const maxEsfuerzo = 525;
  const maxTotal = 1000;
  
  return (
    <div className="space-y-4" data-testid="scoring-breakdown-section">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-3 w-3 text-muted-foreground" />
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Análisis de Priorización
        </h4>
      </div>
      
      {/* Quadrant Badge */}
      <div className="flex items-center gap-2">
        <Badge 
          variant="outline" 
          className={cn("gap-1 border", quadrant.color)}
          data-testid="quadrant-badge"
        >
          <QuadrantIcon className="h-3 w-3" />
          {quadrant.name}
        </Badge>
        <span className="text-xs text-muted-foreground">{quadrant.description}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-xs">
            Clasificación: Quick Win (ejecutar primero), Big Bet, Fill-In, Money Pit (evitar)
          </TooltipContent>
        </Tooltip>
      </div>
      
      {/* Score Summary */}
      <div className="space-y-3 p-3 rounded-md border border-border bg-muted/30">
        {/* Total Valor */}
        <div className="space-y-1" data-testid="score-total-valor">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Total Valor
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs">
                  Suma de 5 dimensiones: sponsor, impacto financiero, alcance, transformación, usuarios
                </TooltipContent>
              </Tooltip>
            </span>
            <span className="font-medium tabular-nums">{totalValor ?? "—"}/{maxValor}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-traffic-green transition-all"
              style={{ width: `${totalValor ? (totalValor / maxValor) * 100 : 0}%` }}
            />
          </div>
        </div>
        
        {/* Total Esfuerzo */}
        <div className="space-y-1" data-testid="score-total-esfuerzo">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Target className="h-3 w-3" />
              Total Esfuerzo
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs">
                  Suma de 4 dimensiones (invertido: mayor = menor esfuerzo real)
                </TooltipContent>
              </Tooltip>
            </span>
            <span className="font-medium tabular-nums">{totalEsfuerzo ?? "—"}/{maxEsfuerzo}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${totalEsfuerzo ? (totalEsfuerzo / maxEsfuerzo) * 100 : 0}%` }}
            />
          </div>
        </div>
        
        {/* Puntaje Total and Ranking */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-4">
            <div className="space-y-0.5" data-testid="score-puntaje-total">
              <span className="text-xs text-muted-foreground">Puntaje Total</span>
              <p className="text-lg font-semibold tabular-nums">{puntajeTotal ?? "—"}</p>
            </div>
          </div>
          {ranking !== null && (
            <div className="flex items-center gap-2" data-testid="score-ranking">
              <Award className="h-5 w-5 text-traffic-yellow" />
              <div className="text-right">
                <span className="text-xs text-muted-foreground block">Ranking</span>
                <span className="text-lg font-bold tabular-nums">#{ranking}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Dimension Breakdown - Collapsible */}
      <Collapsible
        open={isBreakdownExpanded}
        onOpenChange={setIsBreakdownExpanded}
        data-testid="scoring-dimensions-breakdown"
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover-elevate rounded-md px-2 -mx-2">
          <span>Desglose de Dimensiones</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isBreakdownExpanded && "rotate-180"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 mt-2">
            {/* Value Dimensions */}
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-traffic-green flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Dimensiones de Valor
              </h5>
              <div className="space-y-1 pl-4">
                {valueDimensions.map((dim) => (
                  <div 
                    key={dim.id} 
                    className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0"
                    data-testid={`dimension-${dim.id}`}
                  >
                    <span className="text-muted-foreground">{dim.label}</span>
                    <div className="flex items-center gap-2">
                      {dim.selectedPattern ? (
                        <>
                          <span className="font-medium truncate max-w-[120px]" title={dim.selectedPattern}>
                            {dim.selectedPattern}
                          </span>
                          {dim.score !== null && (
                            <Badge variant="secondary" className="text-[10px] px-1.5">
                              {dim.score}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Effort Dimensions */}
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-blue-500 flex items-center gap-1">
                <Target className="h-3 w-3" />
                Dimensiones de Esfuerzo
              </h5>
              <div className="space-y-1 pl-4">
                {effortDimensions.map((dim) => (
                  <div 
                    key={dim.id} 
                    className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0"
                    data-testid={`dimension-${dim.id}`}
                  >
                    <span className="text-muted-foreground">{dim.label}</span>
                    <div className="flex items-center gap-2">
                      {dim.selectedPattern ? (
                        <>
                          <span className="font-medium truncate max-w-[120px]" title={dim.selectedPattern}>
                            {dim.selectedPattern}
                          </span>
                          {dim.score !== null && (
                            <Badge variant="secondary" className="text-[10px] px-1.5">
                              {dim.score}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

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
                      <FieldLabelWithTooltip 
                        icon={Hash} 
                        label="ID / Ranking" 
                        tooltip="Trazabilidad hacia sistemas anteriores (Power Steering, DevOps)"
                      />
                      <p className="text-sm font-medium">{project.legacyId}</p>
                    </div>
                  )}
                  <div className="space-y-1" data-testid="field-estatus-al-dia">
                    <FieldLabelWithTooltip 
                      icon={AlertTriangle} 
                      label="Estatus al Día" 
                      tooltip="Indicador visual de riesgo: On time, Stand by, En riesgo"
                    />
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
                    <FieldLabelWithTooltip 
                      icon={User} 
                      label="Líder / Solicitante" 
                      tooltip="Persona responsable de la ejecución diaria del proyecto"
                    />
                    <p className="text-sm font-medium">{project.responsible || "—"}</p>
                  </div>
                  <div className="space-y-1" data-testid="field-sponsor">
                    <FieldLabelWithTooltip 
                      icon={Users} 
                      label="Dueño del Proceso / Sponsor" 
                      tooltip="Ejecutivo que patrocina, remueve obstáculos y es dueño del proceso"
                    />
                    <p className="text-sm font-medium">{project.sponsor || "—"}</p>
                  </div>
                  <div className="space-y-1" data-testid="field-department">
                    <FieldLabelWithTooltip 
                      icon={Building2} 
                      label="Proceso de Negocio / Área" 
                      tooltip="Área funcional que se beneficia del proyecto"
                    />
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
                    <FieldLabelWithTooltip 
                      icon={Calendar} 
                      label="Fecha Inicio" 
                      tooltip="Inicio oficial del proyecto - base para calcular tiempo de ciclo"
                    />
                    <p className="text-sm font-medium">{formatDate(project.startDate)}</p>
                  </div>
                  <div className="space-y-1" data-testid="field-end-date-estimated">
                    <FieldLabelWithTooltip 
                      icon={Flag} 
                      label="Fecha Término Estimada" 
                      tooltip="Compromiso de entrega para planificar beneficios"
                    />
                    <p className="text-sm font-medium">
                      {project.endDateEstimatedTbd ? "TBD" : formatDate(project.endDateEstimated)}
                    </p>
                  </div>
                  {project.endDateActual && (
                    <div className="space-y-1" data-testid="field-end-date-actual">
                      <FieldLabelWithTooltip 
                        icon={Flag} 
                        label="Fecha Término Real" 
                        tooltip="Cierre real para medir precisión de estimaciones"
                      />
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
                  <FieldLabelWithTooltip 
                    icon={Clock} 
                    label="% Avance" 
                    tooltip="Porcentaje de completitud para identificar proyectos estancados"
                  />
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

              {/* Scoring Breakdown Section - Priority Analysis */}
              <Separator />
              <ScoringBreakdownSection project={project} />

              {/* Extra Fields from Excel - Organized by PMO Categories */}
              {project.extraFields && Object.keys(project.extraFields).length > 0 && (
                <>
                  <Separator />
                  <ExtraFieldsSections extraFields={project.extraFields as Record<string, unknown>} />
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
