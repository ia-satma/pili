/**
 * Status Mapping - Single source of truth for status normalization
 * Maps raw status values from Excel to canonical status categories
 */

export type CanonicalStatus = 
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'CLOSED'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'UNKNOWN';

const STATUS_MAP: Record<string, CanonicalStatus> = {
  // CLOSED variants
  'terminado': 'CLOSED',
  'cerrado': 'CLOSED',
  'completado': 'CLOSED',
  'finalizado': 'CLOSED',
  'closed': 'CLOSED',
  'completed': 'CLOSED',
  'done': 'CLOSED',
  'finished': 'CLOSED',
  
  // OPEN variants  
  'nuevo': 'OPEN',
  'abierto': 'OPEN',
  'proyecto nuevo': 'OPEN',
  'new': 'OPEN',
  'open': 'OPEN',
  'nuevo arrancado': 'OPEN',
  
  // IN_PROGRESS variants
  'desarrollo': 'IN_PROGRESS',
  'en desarrollo': 'IN_PROGRESS',
  'en progreso': 'IN_PROGRESS',
  'on going': 'IN_PROGRESS',
  'ongoing': 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  'active': 'IN_PROGRESS',
  'activo': 'IN_PROGRESS',
  'análisis': 'IN_PROGRESS',
  'analisis': 'IN_PROGRESS',
  'pruebas': 'IN_PROGRESS',
  'testing': 'IN_PROGRESS',
  'implementación': 'IN_PROGRESS',
  'implementacion': 'IN_PROGRESS',
  
  // ON_HOLD variants
  'pausa': 'ON_HOLD',
  'en pausa': 'ON_HOLD',
  'pausado': 'ON_HOLD',
  'on hold': 'ON_HOLD',
  'hold': 'ON_HOLD',
  'detenido': 'ON_HOLD',
  
  // CANCELLED variants
  'cancelado': 'CANCELLED',
  'cancelled': 'CANCELLED',
  'canceled': 'CANCELLED',
  'descartado': 'CANCELLED',
};

/**
 * Map a raw status string to canonical status
 */
export function mapToCanonicalStatus(rawStatus: string | null | undefined): CanonicalStatus {
  if (!rawStatus) return 'UNKNOWN';
  
  const normalized = rawStatus.toLowerCase().trim();
  return STATUS_MAP[normalized] || 'UNKNOWN';
}

/**
 * Check if a status is considered "open" (active work)
 */
export function isOpenStatus(status: CanonicalStatus): boolean {
  return status === 'OPEN' || status === 'IN_PROGRESS';
}

/**
 * Check if a status is considered "closed" (completed work)
 */
export function isClosedStatus(status: CanonicalStatus): boolean {
  return status === 'CLOSED';
}

/**
 * Get display label for canonical status (Spanish)
 */
export function getStatusLabel(status: CanonicalStatus): string {
  const labels: Record<CanonicalStatus, string> = {
    OPEN: 'Abierto',
    IN_PROGRESS: 'En Progreso',
    CLOSED: 'Cerrado',
    ON_HOLD: 'En Pausa',
    CANCELLED: 'Cancelado',
    UNKNOWN: 'Desconocido',
  };
  return labels[status];
}
