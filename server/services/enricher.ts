import OpenAI from "openai";
import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";
import type { Project } from "@shared/schema";
import { isOpenAIConfigured } from "../openai";

const MODEL = "gpt-5";

const openai = isOpenAIConfigured()
  ? new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    })
  : null;

export interface EnrichmentSuggestion {
  problemStatement: string;
  scopeIn: string;
  scopeOut: string;
  objective: string;
}

export interface EnrichmentResult {
  success: boolean;
  original: {
    problemStatement: string | null;
    scopeIn: string | null;
    scopeOut: string | null;
    objective: string | null;
  };
  suggestion: EnrichmentSuggestion | null;
  error?: string;
}

function isRateLimitError(error: unknown): boolean {
  const errorMsg = error instanceof Error ? error.message : String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

const ENRICHER_SYSTEM_PROMPT = `Eres un Consultor Experto de PMO (Project Management Office) especializado en documentación de proyectos de mejora continua.

TU MISIÓN:
Generar documentación profesional y completa para proyectos que tienen información incompleta o vaga.

REGLAS ESTRICTAS:
1. Genera contenido PROFESIONAL y ESPECÍFICO basado en el nombre del proyecto
2. El Problem Statement debe ser concreto, medible y justificar un presupuesto
3. El Scope In debe listar 3-5 entregables específicos incluidos
4. El Scope Out debe listar 2-3 elementos explícitamente excluidos para evitar scope creep
5. El Objective debe ser un objetivo SMART (Específico, Medible, Alcanzable, Relevante, Temporal)
6. Escribe TODO en español profesional de negocios
7. NO uses frases genéricas o placeholder

FORMATO DE RESPUESTA (JSON ESTRICTO):
{
  "problemStatement": "Descripción clara del problema actual con métricas o impacto cuantificable...",
  "scopeIn": "• Entregable 1\\n• Entregable 2\\n• Entregable 3",
  "scopeOut": "• Exclusión 1\\n• Exclusión 2",
  "objective": "Objetivo SMART del proyecto..."
}`;

export async function enrichProjectMetadata(project: Project): Promise<EnrichmentResult> {
  const original = {
    problemStatement: project.problemStatement,
    scopeIn: project.scopeIn,
    scopeOut: project.scopeOut,
    objective: project.objective,
  };

  if (!openai) {
    return {
      success: false,
      original,
      suggestion: null,
      error: "OpenAI no está configurado. Contacta al administrador para habilitar la integración.",
    };
  }

  const limit = pLimit(1);

  try {
    const result = await limit(() =>
      pRetry(
        async () => {
          const contextInfo = [
            `Nombre del Proyecto: ${project.projectName}`,
            project.bpAnalyst ? `Analista: ${project.bpAnalyst}` : null,
            project.sponsor ? `Sponsor: ${project.sponsor}` : null,
            project.departmentName ? `Departamento: ${project.departmentName}` : null,
            project.budget ? `Presupuesto: $${project.budget.toLocaleString()} MXN` : null,
            project.description ? `Descripción actual: ${project.description}` : null,
            project.benefits ? `Beneficios esperados: ${project.benefits}` : null,
            project.problemStatement ? `Problem Statement actual (incompleto): ${project.problemStatement}` : null,
          ]
            .filter(Boolean)
            .join("\n");

          const userPrompt = `Analiza este proyecto y genera documentación profesional completa:

${contextInfo}

IMPORTANTE: 
- Si el proyecto tiene un Problem Statement actual pero es muy corto o vago, MEJÓRALO significativamente
- Genera contenido que justifique el presupuesto asignado
- El contenido debe ser específico para este tipo de proyecto, no genérico

Responde SOLO con el JSON válido.`;

          const response = await openai.chat.completions.create({
            model: MODEL,
            messages: [
              { role: "system", content: ENRICHER_SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            max_completion_tokens: 1024,
            response_format: { type: "json_object" },
          });

          const content = response.choices[0]?.message?.content || "";
          const parsed = JSON.parse(content);

          return {
            problemStatement: parsed.problemStatement || "",
            scopeIn: parsed.scopeIn || "",
            scopeOut: parsed.scopeOut || "",
            objective: parsed.objective || "",
          };
        },
        {
          retries: 2,
          minTimeout: 1000,
          maxTimeout: 5000,
          factor: 2,
          onFailedAttempt: (failedAttempt) => {
            const originalError = failedAttempt.error || failedAttempt;
            if (!isRateLimitError(originalError)) {
              throw new AbortError(String(originalError));
            }
          },
        }
      )
    );

    return {
      success: true,
      original,
      suggestion: result,
    };
  } catch (error) {
    console.error("Enrichment error:", error);
    return {
      success: false,
      original,
      suggestion: null,
      error: error instanceof Error ? error.message : "Error al generar sugerencias",
    };
  }
}
