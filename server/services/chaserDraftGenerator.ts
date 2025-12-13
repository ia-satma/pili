import { storage } from "../storage";
import type { GovernanceAlert, Initiative, InsertChaserDraft } from "@shared/schema";

interface ChaserResult {
  draftsCreated: number;
  initiativesProcessed: number;
}

function generateChaserSubject(
  initiative: Initiative,
  alert: GovernanceAlert
): string {
  const signalLabels: Record<string, string> = {
    ZOMBI: "Seguimiento Requerido - Sin Actualizaciones",
    ANGUILA: "Alerta de Fechas - Desplazamiento Detectado",
    OPTIMISTA: "Revisión de Puntaje - Validación Requerida",
    INDECISO: "Cambios Frecuentes Detectados",
    DRENAJE_DE_VALOR: "Alerta de Valor - Disminución Detectada",
  };
  
  const signalLabel = signalLabels[alert.signalCode] || alert.signalCode;
  return `[PILAR] ${signalLabel}: ${initiative.title}`;
}

function generateChaserBody(
  initiative: Initiative,
  alert: GovernanceAlert
): string {
  const now = new Date().toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const signalDescriptions: Record<string, string> = {
    ZOMBI: "Esta iniciativa no ha recibido actualizaciones de estado en un período prolongado.",
    ANGUILA: "Se han detectado múltiples cambios en las fechas estimadas de finalización.",
    OPTIMISTA: "Se detectó un incremento significativo en el puntaje sin entradas de evaluación nuevas.",
    INDECISO: "Se detectaron cambios frecuentes de ida y vuelta en campos clave.",
    DRENAJE_DE_VALOR: "El valor total de la iniciativa ha disminuido en snapshots consecutivos.",
  };

  const signalDescription = signalDescriptions[alert.signalCode] || "Se ha detectado una alerta que requiere atención.";

  return `
Estimado/a Responsable,

Se ha generado una alerta de gobernanza para la siguiente iniciativa que requiere su atención:

**Iniciativa:** ${initiative.title}
**ID:** ${initiative.id}
**Responsable:** ${initiative.owner || "No asignado"}

**Tipo de Alerta:** ${alert.signalCode}
**Severidad:** ${alert.severity}
**Fecha de Detección:** ${new Date(alert.detectedAt).toLocaleDateString("es-MX")}

**Descripción:**
${signalDescription}

**Detalle:**
${alert.rationale || "Sin detalle adicional disponible."}

**Acción Requerida:**
Por favor, revise esta iniciativa y proporcione una actualización de estado a la brevedad. Si tiene preguntas o necesita asistencia, contacte al equipo de PMO.

---
Este mensaje fue generado automáticamente por PILAR el ${now}.
Para más información, acceda al dashboard de PMO.
`.trim();
}

export async function generateChaserDrafts(): Promise<ChaserResult> {
  const openAlerts = await storage.getOpenAlerts();
  
  const relevantAlerts = openAlerts.filter(alert => 
    alert.severity === "HIGH" || alert.signalCode === "ZOMBI"
  );

  const alertsByInitiative = new Map<number, GovernanceAlert[]>();
  for (const alert of relevantAlerts) {
    const existing = alertsByInitiative.get(alert.initiativeId) || [];
    existing.push(alert);
    alertsByInitiative.set(alert.initiativeId, existing);
  }

  let draftsCreated = 0;
  const initiativesProcessed = alertsByInitiative.size;

  for (const [initiativeId, alerts] of alertsByInitiative) {
    const initiative = await storage.getInitiative(initiativeId);
    if (!initiative) continue;

    const priorityAlert = alerts.find(a => a.severity === "HIGH") || alerts[0];

    const existingDrafts = await storage.getChaserDraftsByInitiative(initiativeId);
    const recentDraft = existingDrafts.find(d => 
      d.alertId === priorityAlert.id && d.status === "DRAFT"
    );
    
    if (recentDraft) {
      continue;
    }

    const subject = generateChaserSubject(initiative, priorityAlert);
    const body = generateChaserBody(initiative, priorityAlert);

    await storage.createChaserDraft({
      initiativeId,
      alertId: priorityAlert.id,
      subject,
      body,
      status: "DRAFT",
    });

    draftsCreated++;
  }

  return {
    draftsCreated,
    initiativesProcessed,
  };
}
