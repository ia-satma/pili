import { db } from "../db";
import { projects } from "@shared/schema";
import { eq, lt, and } from "drizzle-orm";
import type { Project } from "@shared/schema";

/**
 * ============================================================================
 * PMO CHASER AGENT - TARGETED NOTIFICATION DRAFTS
 * ============================================================================
 * 
 * Generates targeted email drafts based on SPECIFIC audit flags.
 * Does NOT send emails automatically - creates drafts for PMO Director review.
 * 
 * TRIGGER CONDITIONS:
 * - Only projects with health_score < 60
 * - Only specific audit flags trigger drafts
 * ============================================================================
 */

export interface ChaserDraft {
  projectId: number;
  projectName: string;
  responsible: string | null;
  sponsor: string | null;
  department: string | null;
  triggeredBy: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  subject: string;
  body: string;
  suggestedAction: string;
  createdAt: string;
}

export interface ChaserCycleResult {
  totalScanned: number;
  draftsGenerated: number;
  drafts: ChaserDraft[];
  cycleCompletedAt: string;
}

/**
 * Audit flag to email template mapping
 */
interface FlagTemplate {
  flagPattern: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  subjectTemplate: (project: Project) => string;
  bodyTemplate: (project: Project) => string;
  suggestedAction: string;
}

const FLAG_TEMPLATES: FlagTemplate[] = [
  {
    flagPattern: "Posible costo oculto detectado en descripción",
    severity: "HIGH",
    subjectTemplate: (p) => `[URGENTE] Incongruencia detectada en proyecto: ${p.projectName}`,
    bodyTemplate: (p) => `Estimado/a ${p.responsible || p.sponsor || "Responsable"},

Tu proyecto "${p.projectName}" declara inversión CERO, pero la descripción menciona términos relacionados con compras, licencias o hardware.

**Problema detectado:**
El sistema ha identificado palabras clave en la descripción (como "compra", "licencia", "hardware", "adquisición") que sugieren costos no declarados.

**Acción requerida:**
1. Revisa la clasificación de inversión del proyecto
2. Actualiza el campo "Inversión CAPEX" con el valor correcto
3. Si realmente no hay inversión, aclara la descripción

**Fecha límite:** 5 días hábiles

Si no se corrige esta incongruencia, el proyecto será marcado para revisión de cancelación.

Atentamente,
PMO Dashboard Automatizado`,
    suggestedAction: "Solicitar corrección de clasificación CAPEX o aclaración de descripción",
  },
  {
    flagPattern: "Beneficio alto sin sustento detallado",
    severity: "HIGH",
    subjectTemplate: (p) => `[ACCIÓN REQUERIDA] Justificación pendiente: ${p.projectName}`,
    bodyTemplate: (p) => `Estimado/a ${p.responsible || p.sponsor || "Responsable"},

Tu proyecto "${p.projectName}" declara beneficios financieros superiores a $300,000 USD, pero la descripción es insuficiente para justificar esta cifra.

**Problema detectado:**
- Beneficio declarado: >$300k USD (clasificación HIGH_REVENUE)
- Descripción actual: Menos de 20 caracteres

**Acción requerida:**
1. Detalla cómo se calculó el beneficio esperado
2. Incluye métricas base y proyecciones
3. Especifica el período de realización del beneficio

**Información mínima necesaria:**
- Fuente del beneficio (ventas incrementales, reducción de costos, etc.)
- Cálculo detallado con supuestos
- Línea base y objetivo

Proyectos sin sustento adecuado serán deprioritizados en el portafolio.

Atentamente,
PMO Dashboard Automatizado`,
    suggestedAction: "Solicitar cálculo detallado de beneficios y justificación financiera",
  },
  {
    flagPattern: "Fecha de término anterior al inicio",
    severity: "MEDIUM",
    subjectTemplate: (p) => `[CORREGIR] Error de fechas en proyecto: ${p.projectName}`,
    bodyTemplate: (p) => `Estimado/a ${p.responsible || p.sponsor || "Responsable"},

El proyecto "${p.projectName}" tiene una paradoja temporal: la fecha de fin es anterior a la fecha de inicio.

**Problema detectado:**
Las fechas del proyecto son inconsistentes. Esto puede deberse a un error de captura.

**Acción requerida:**
1. Revisa las fechas de inicio y fin del proyecto
2. Corrige las fechas en el sistema

Este es un error de datos que afecta los reportes del portafolio.

Atentamente,
PMO Dashboard Automatizado`,
    suggestedAction: "Solicitar corrección de fechas del proyecto",
  },
  {
    flagPattern: "Proyecto sin responsable asignado",
    severity: "MEDIUM",
    subjectTemplate: (p) => `[ASIGNAR] Proyecto huérfano: ${p.projectName}`,
    bodyTemplate: (p) => `Estimado/a ${p.sponsor || "Sponsor"},

El proyecto "${p.projectName}" no tiene un responsable asignado.

**Problema detectado:**
- Campo "Responsable": Vacío o TBD
- Campo "Líder": Vacío o TBD

Los proyectos sin responsable claro tienen alta probabilidad de fracaso.

**Acción requerida:**
1. Asigna un responsable con nombre y apellido
2. Actualiza el campo en el sistema

Proyectos huérfanos serán escalados a revisión de gobernanza.

Atentamente,
PMO Dashboard Automatizado`,
    suggestedAction: "Escalar a sponsor para asignación de responsable",
  },
  {
    flagPattern: "Sin clasificación CAPEX",
    severity: "MEDIUM",
    subjectTemplate: (p) => `[COMPLETAR] Clasificación pendiente: ${p.projectName}`,
    bodyTemplate: (p) => `Estimado/a ${p.responsible || p.sponsor || "Responsable"},

El proyecto "${p.projectName}" no tiene clasificación de inversión CAPEX.

**Acción requerida:**
Actualiza el campo "Inversión CAPEX" con una de las siguientes opciones:
- Alto (>$100k USD)
- Medio ($20k-$100k USD)
- Bajo (<$20k USD)
- Nulo (Sin inversión)

Esta clasificación es crítica para la priorización del portafolio.

Atentamente,
PMO Dashboard Automatizado`,
    suggestedAction: "Solicitar clasificación CAPEX del proyecto",
  },
  {
    flagPattern: "Sin clasificación de beneficio financiero",
    severity: "MEDIUM",
    subjectTemplate: (p) => `[COMPLETAR] Beneficio no clasificado: ${p.projectName}`,
    bodyTemplate: (p) => `Estimado/a ${p.responsible || p.sponsor || "Responsable"},

El proyecto "${p.projectName}" no tiene clasificación de beneficio financiero.

**Acción requerida:**
Actualiza el campo "Beneficio Financiero" con una de las siguientes opciones:
- Alto (>$300k USD)
- Medio ($100k-$300k USD)
- Bajo (<$100k USD)
- Ninguno

Esta clasificación es crítica para la priorización del portafolio.

Atentamente,
PMO Dashboard Automatizado`,
    suggestedAction: "Solicitar clasificación de beneficio financiero",
  },
];

/**
 * Run a chaser cycle - scans projects and generates drafts
 */
export async function runChaserCycle(): Promise<ChaserCycleResult> {
  const criticalProjects = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.isActive, true),
        lt(projects.healthScore, 60)
      )
    );

  const drafts: ChaserDraft[] = [];

  for (const project of criticalProjects) {
    const auditFlags = (project.auditFlags as string[]) || [];
    
    for (const flag of auditFlags) {
      const template = FLAG_TEMPLATES.find(t => 
        flag.toLowerCase().includes(t.flagPattern.toLowerCase()) ||
        t.flagPattern.toLowerCase().includes(flag.toLowerCase())
      );

      if (template) {
        drafts.push({
          projectId: project.id,
          projectName: project.projectName || "Sin nombre",
          responsible: project.responsible,
          sponsor: project.sponsor,
          department: project.departmentName,
          triggeredBy: flag,
          severity: template.severity,
          subject: template.subjectTemplate(project),
          body: template.bodyTemplate(project),
          suggestedAction: template.suggestedAction,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  // Sort by severity (HIGH first)
  drafts.sort((a, b) => {
    const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  console.log("[CHASER] Cycle complete:");
  console.log(`  - Scanned: ${criticalProjects.length} critical projects`);
  console.log(`  - Drafts generated: ${drafts.length}`);
  console.log(`  - HIGH severity: ${drafts.filter(d => d.severity === "HIGH").length}`);
  console.log(`  - MEDIUM severity: ${drafts.filter(d => d.severity === "MEDIUM").length}`);

  return {
    totalScanned: criticalProjects.length,
    draftsGenerated: drafts.length,
    drafts,
    cycleCompletedAt: new Date().toISOString(),
  };
}

/**
 * Get draft statistics without running a full cycle
 */
export async function getChaserStats(): Promise<{
  criticalProjectsCount: number;
  estimatedDrafts: number;
}> {
  const criticalProjects = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.isActive, true),
        lt(projects.healthScore, 60)
      )
    );

  let estimatedDrafts = 0;
  for (const project of criticalProjects) {
    const auditFlags = (project.auditFlags as string[]) || [];
    for (const flag of auditFlags) {
      const hasTemplate = FLAG_TEMPLATES.some(t => 
        flag.toLowerCase().includes(t.flagPattern.toLowerCase()) ||
        t.flagPattern.toLowerCase().includes(flag.toLowerCase())
      );
      if (hasTemplate) estimatedDrafts++;
    }
  }

  return {
    criticalProjectsCount: criticalProjects.length,
    estimatedDrafts,
  };
}
