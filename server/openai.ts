// Using javascript_openai_ai_integrations blueprint
// This uses Replit's AI Integrations service, which provides OpenAI-compatible API access
// without requiring your own API key. Charges are billed to your Replit credits.
import OpenAI from "openai";
import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";
import type { Project } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const MODEL = "gpt-5";

const isConfigured = !!(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && process.env.AI_INTEGRATIONS_OPENAI_API_KEY);

const openai = isConfigured ? new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
}) : null;

export function isOpenAIConfigured(): boolean {
  return isConfigured;
}

function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

export interface ChatContext {
  projects: Project[];
  versionId: number | null;
  versionFileName: string | null;
}

export interface Citation {
  sheet?: string;
  row?: number;
  column?: string;
  value?: string;
}

export interface PMOBotResponse {
  content: string;
  citations: Citation[];
}

const SYSTEM_PROMPT = `Eres el PMO Bot, un asistente especializado para el equipo de PMO (Project Management Office).

REGLAS ESTRICTAS - DEBES SEGUIRLAS SIN EXCEPCIÓN:
1. SOLO puedes responder con datos que existen EXPLÍCITAMENTE en la base de datos de proyectos.
2. NUNCA debes inferir, deducir, predecir o asumir valores que no existan.
3. NUNCA debes generar opiniones, hipótesis o interpretaciones.
4. Si algo no existe en los datos, responde: "No existe ese dato en los proyectos cargados."
5. Para cada respuesta debes identificar qué proyecto(s) estás referenciando.
6. Debes rechazar cualquier petición de predicción de resultados o suposición.

CAPACIDADES:
- Consultar el estado exacto de un proyecto
- Contar proyectos por estado, departamento, responsable
- Listar proyectos que cumplan ciertos criterios
- Mostrar información de campos específicos
- Responder preguntas sobre fechas, avances, estados

FORMATO DE RESPUESTA (OBLIGATORIO JSON):
Debes responder SIEMPRE en formato JSON con esta estructura:
{
  "respuesta": "Tu respuesta aquí...",
  "citas": [{"fila": 1, "columna": "A", "valor": "dato citado"}]
}
- Sé conciso y directo en el campo "respuesta"
- Usa listas cuando sea apropiado dentro del texto
- Incluye los nombres exactos de los proyectos cuando los menciones
- El campo "citas" puede estar vacío [] si no hay citas específicas

DATOS DISPONIBLES POR PROYECTO:
- projectName: Nombre del proyecto
- status: Estado (Abierto, Cerrado, En Pausa, etc.)
- departmentName: Departamento
- responsible: Responsable
- sponsor: Sponsor
- startDate: Fecha de inicio
- endDateEstimated: Fecha estimada de fin
- endDateEstimatedTbd: Si la fecha es TBD
- percentComplete: Porcentaje de avance
- priority: Prioridad (Alta, Media, Baja)
- category: Categoría
- parsedStatus: Último status (S:)
- parsedNextSteps: Próximos pasos (N:)
- description: Descripción
- benefits: Beneficios
- scope: Alcance
- risks: Riesgos`;

export async function generatePMOBotResponse(
  userMessage: string,
  context: ChatContext
): Promise<PMOBotResponse> {
  if (!openai) {
    return {
      content: "El asistente PMO Bot no está configurado actualmente. Por favor contacta al administrador para habilitar la integración con OpenAI.",
      citations: [],
    };
  }

  const limit = pLimit(1);

  return limit(() =>
    pRetry(
      async () => {
        // Build context from projects
        const projectsSummary = context.projects.map((p, index) => ({
          id: p.id,
          nombre: p.projectName,
          estado: p.status || "Sin estado",
          departamento: p.departmentName || "Sin departamento",
          responsable: p.responsible || "Sin asignar",
          avance: `${p.percentComplete || 0}%`,
          fechaFin: p.endDateEstimatedTbd ? "TBD" : (p.endDateEstimated || "Sin fecha"),
          prioridad: p.priority || "Sin prioridad",
          ultimoStatus: p.parsedStatus || "Sin actualización",
          proximosPasos: p.parsedNextSteps || "Sin próximos pasos",
        }));

        const dataContext = `
DATOS ACTUALES (Versión: ${context.versionFileName || "Sin versión"}):
Total de proyectos: ${context.projects.length}

Proyectos:
${JSON.stringify(projectsSummary, null, 2)}
`;

        const response = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "system", content: dataContext },
            { role: "user", content: userMessage },
          ],
          max_completion_tokens: 2048,
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content || "";
        
        try {
          const parsed = JSON.parse(content);
          return {
            content: parsed.respuesta || parsed.response || parsed.content || content,
            citations: (parsed.citas || parsed.citations || []).map((c: any) => ({
              sheet: c.sheet || c.hoja,
              row: c.row || c.fila,
              column: c.column || c.columna,
              value: c.value || c.valor,
            })),
          };
        } catch {
          // If JSON parsing fails, return raw content
          return {
            content: content,
            citations: [],
          };
        }
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 10000,
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
}
