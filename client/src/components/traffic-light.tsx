import { cn } from "@/lib/utils";
import type { TrafficLightStatus } from "@shared/schema";

interface TrafficLightProps {
  status: TrafficLightStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const statusLabels: Record<TrafficLightStatus, string> = {
  green: "En tiempo",
  yellow: "Próximo a vencer",
  red: "Vencido",
  gray: "Sin fecha",
};

const statusColors: Record<TrafficLightStatus, string> = {
  green: "bg-traffic-green",
  yellow: "bg-traffic-yellow",
  red: "bg-traffic-red",
  gray: "bg-traffic-gray",
};

const sizeClasses = {
  sm: "h-2.5 w-2.5",
  md: "h-3 w-3",
  lg: "h-4 w-4",
};

export function TrafficLight({ status, size = "md", showLabel = false }: TrafficLightProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "rounded-full flex-shrink-0",
          sizeClasses[size],
          statusColors[status]
        )}
        role="status"
        aria-label={statusLabels[status]}
        data-testid={`traffic-light-${status}`}
      />
      {showLabel && (
        <span className="text-sm text-muted-foreground">{statusLabels[status]}</span>
      )}
    </div>
  );
}

export function calculateTrafficLight(
  endDateEstimated: string | null | undefined,
  endDateEstimatedTbd: boolean | null | undefined,
  status: string | null | undefined,
  estatusAlDia?: string | null | undefined,
  warningDays: number = 7
): TrafficLightStatus {
  // PRIORITY 1: Use "ESTATUS AL DÍA" from Excel if available
  // These are the EXACT values from the Excel filter:
  // - On time (GREEN)
  // - No iniciado (GRAY)
  // - Cancelado (GRAY)
  // - Stand by (YELLOW)
  // - En riesgo ente >1<2 meses (RED)
  // - En riesgo o vencido > 2 meses (RED)
  // - (Vacías) - empty values (GRAY)
  if (estatusAlDia) {
    const lower = estatusAlDia.toLowerCase().trim();
    
    // GREEN: On time
    if (lower === "on time" || lower === "a tiempo" || lower === "en tiempo") {
      return "green";
    }
    
    // RED: Risk or overdue variants (exact Excel values)
    // "En riesgo ente >1<2 meses" and "En riesgo o vencido > 2 meses"
    if (lower.includes("riesgo") || lower.includes("vencido")) {
      return "red";
    }
    
    // YELLOW: Stand by
    if (lower === "stand by" || lower === "standby" || lower === "en espera") {
      return "yellow";
    }
    
    // GRAY: Not started, cancelled
    if (lower === "no iniciado" || lower === "cancelado" || lower === "not started" || lower === "cancelled") {
      return "gray";
    }
    
    // Any other non-empty value = yellow (unknown status)
    if (lower.length > 0) {
      return "yellow";
    }
  }

  // FALLBACK: Calculate from dates if no estatusAlDia
  if (endDateEstimatedTbd || !endDateEstimated) {
    return "gray";
  }

  // Green if closed
  if (status?.toLowerCase() === "cerrado" || status?.toLowerCase() === "closed" || status?.toLowerCase() === "terminado") {
    return "green";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Add T12:00:00 to avoid timezone issues with date-only strings
  const dateStr = endDateEstimated.includes("T") ? endDateEstimated : `${endDateEstimated}T12:00:00`;
  const dueDate = new Date(dateStr);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Red: overdue and not closed
  if (diffDays < 0) {
    return "red";
  }

  // Yellow: approaching deadline
  if (diffDays <= warningDays) {
    return "yellow";
  }

  // Green: on track
  return "green";
}

export function getDaysUntilDue(endDateEstimated: string | null | undefined): number | undefined {
  if (!endDateEstimated) return undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Add T12:00:00 to avoid timezone issues with date-only strings
  const dateStr = endDateEstimated.includes("T") ? endDateEstimated : `${endDateEstimated}T12:00:00`;
  const dueDate = new Date(dateStr);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
