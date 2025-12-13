import { storage } from "../storage";

interface AgentConfig {
  name: string;
  purpose: string;
  enabled: boolean;
  promptTemplate: string;
}

const COMMITTEE_BRIEF_PROMPT = `Analiza la siguiente evidencia de iniciativa y genera un resumen ejecutivo para el comité de seguimiento.

{{EVIDENCE}}

## Tu tarea:
1. Resume el estado actual de la iniciativa en 2-3 oraciones
2. Identifica los principales riesgos o alertas activas
3. Recomienda acciones específicas basadas en los deltas recientes
4. Proporciona una calificación de salud: VERDE (en buen camino), AMARILLO (requiere atención), ROJO (crítico)

Formato de respuesta:
### Resumen Ejecutivo
[Tu resumen aquí]

### Alertas y Riesgos
[Lista de alertas detectadas con severidad]

### Acciones Recomendadas
[Lista numerada de acciones]

### Calificación de Salud
[VERDE/AMARILLO/ROJO] - [Justificación breve]

IMPORTANTE: Solo usa información de la evidencia proporcionada. No inventes datos.`;

const AGENTS: AgentConfig[] = [
  {
    name: "CommitteeBriefAgent",
    purpose: "Genera resúmenes ejecutivos para el comité de seguimiento de proyectos",
    enabled: true,
    promptTemplate: COMMITTEE_BRIEF_PROMPT,
  },
  {
    name: "IntakeAgent",
    purpose: "Procesa solicitudes de nuevas iniciativas y valida información inicial",
    enabled: false,
    promptTemplate: "{{EVIDENCE}}\n\nValida la información de intake de esta iniciativa.",
  },
  {
    name: "CharterAgent",
    purpose: "Genera y revisa cartas de proyecto (project charters)",
    enabled: false,
    promptTemplate: "{{EVIDENCE}}\n\nGenera un borrador de carta de proyecto.",
  },
  {
    name: "RequirementsAgent",
    purpose: "Analiza y organiza requerimientos de proyectos",
    enabled: false,
    promptTemplate: "{{EVIDENCE}}\n\nAnaliza los requerimientos identificados.",
  },
  {
    name: "ProcessAgent",
    purpose: "Mapea y optimiza procesos asociados a iniciativas",
    enabled: false,
    promptTemplate: "{{EVIDENCE}}\n\nAnaliza el proceso descrito en esta iniciativa.",
  },
  {
    name: "PrioritizationAgent",
    purpose: "Recomienda priorización basada en puntuación y recursos",
    enabled: false,
    promptTemplate: "{{EVIDENCE}}\n\nRecomienda la priorización de esta iniciativa.",
  },
  {
    name: "TechAdvisorAgent",
    purpose: "Proporciona asesoría técnica y evaluación de riesgos tecnológicos",
    enabled: false,
    promptTemplate: "{{EVIDENCE}}\n\nEvalúa los aspectos técnicos de esta iniciativa.",
  },
  {
    name: "BenefitsAgent",
    purpose: "Calcula y valida beneficios esperados de proyectos",
    enabled: false,
    promptTemplate: "{{EVIDENCE}}\n\nAnaliza los beneficios esperados de esta iniciativa.",
  },
  {
    name: "RiskExplainerAgent",
    purpose: "Identifica y explica riesgos en lenguaje no técnico",
    enabled: false,
    promptTemplate: "{{EVIDENCE}}\n\nExplica los riesgos de esta iniciativa en términos simples.",
  },
];

export async function seedAgentFleet(): Promise<{
  created: string[];
  skipped: string[];
}> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const config of AGENTS) {
    const existing = await storage.getAgentDefinitionByName(config.name);
    
    if (existing) {
      skipped.push(config.name);
      continue;
    }

    const agentDef = await storage.createAgentDefinition({
      name: config.name,
      purpose: config.purpose,
      enabled: config.enabled,
    });

    await storage.createAgentVersion({
      agentId: agentDef.id,
      version: "1.0.0",
      promptTemplate: config.promptTemplate,
      modelProvider: "openai",
      modelName: "gpt-5",
      isActive: true,
    });

    created.push(config.name);
  }

  return { created, skipped };
}

export async function getAgentFleetStatus(): Promise<{
  agents: Array<{
    name: string;
    purpose: string | null;
    enabled: boolean;
    activeVersion: string | null;
  }>;
}> {
  const definitions = await storage.getAgentDefinitions();
  
  const agents = await Promise.all(
    definitions.map(async (def) => {
      const activeVersion = await storage.getActiveAgentVersion(def.name);
      return {
        name: def.name,
        purpose: def.purpose,
        enabled: def.enabled,
        activeVersion: activeVersion?.version || null,
      };
    })
  );

  return { agents };
}
