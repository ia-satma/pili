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
  warningDays: number = 7
): TrafficLightStatus {
  // Gray for TBD or no date
  if (endDateEstimatedTbd || !endDateEstimated) {
    return "gray";
  }

  // Green if closed
  if (status?.toLowerCase() === "cerrado" || status?.toLowerCase() === "closed") {
    return "green";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dueDate = new Date(endDateEstimated);
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
  
  const dueDate = new Date(endDateEstimated);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
