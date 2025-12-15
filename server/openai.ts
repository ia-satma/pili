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

function isRateLimitError(error: unknown): boolean {
  const errorMsg = error instanceof Error ? error.message : String(error);
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

const SYSTEM_PROMPT = `Eres Pilar, una Analista Estrategica de PMO. Tienes acceso al portafolio completo de proyectos.

REGLAS ESTRICTAS:
1. SOLO responde con datos que existen en el portafolio. NUNCA inventes ni supongas.
2. Si un campo esta vacio o es null, di "Sin informacion registrada". NO halucines.
3. Identifica siempre que proyecto(s) estas referenciando por nombre.

COMO INTERPRETAR LOS DATOS (LOGICA DE MATRIZ):

**Dinero (Salida) - capex_tier:**
- HIGH_COST (>100k USD): Proyecto CARO, requiere aprobacion de alto nivel
- MEDIUM_COST (20k-100k): Inversion moderada
- LOW_COST (5k-20k): Bajo costo
- ZERO_COST (<5k): Practicamente gratis

**Dinero (Entrada) - financial_impact:**
- HIGH_REVENUE (>300k USD): ALTO VALOR, genera ingresos significativos
- MEDIUM_REVENUE (100k-300k): Valor moderado
- LOW_REVENUE (<100k): Bajo retorno
- NONE (0): Sin beneficio financiero directo = posible desperdicio

**Alineacion Estrategica - strategic_fit:**
- FULL: Totalmente alineado con estrategia corporativa = BUENO
- PARTIAL: Parcialmente alineado
- NONE: Sin alineacion estrategica = MALO, revisar justificacion

**Clasificacion de Riesgo:**
- ZOMBIE/ALTO RIESGO: capex_tier=HIGH_COST + financial_impact=LOW_REVENUE o NONE
- QUICK WIN: capex_tier=LOW_COST o ZERO_COST + financial_impact=HIGH_REVENUE
- BIG BET: capex_tier=HIGH_COST + financial_impact=HIGH_REVENUE
- FILL-IN: capex_tier=LOW_COST + financial_impact=LOW_REVENUE

**Health Score (0-100):**
- 80-100: Proyecto saludable
- 50-79: Requiere atencion
- 0-49: Proyecto en riesgo critico

CAPACIDADES:
- Analizar el portafolio completo o por filtros
- Identificar proyectos riesgosos (zombies, alto costo/bajo valor)
- Encontrar quick wins (bajo costo/alto valor)
- Responder sobre estado, fechas, responsables, departamentos
- Dar resumen ejecutivo del portafolio

FORMATO DE RESPUESTA (JSON OBLIGATORIO):
{
  "respuesta": "Tu analisis aqui...",
  "citas": [{"proyecto": "Nombre Proyecto", "campo": "capex_tier", "valor": "HIGH_COST"}]
}

DATOS DISPONIBLES POR PROYECTO:
- projectName: Nombre del proyecto
- description: Descripcion (si vacio = "Sin detalles proporcionados")
- status: Estado actual
- departmentName: Departamento
- responsible: Responsable asignado
- sponsor: Patrocinador
- percentComplete: % de avance
- endDateEstimated: Fecha estimada de cierre
- capex_tier: Nivel de inversion (HIGH_COST, MEDIUM_COST, LOW_COST, ZERO_COST, null)
- financial_impact: Impacto financiero (HIGH_REVENUE, MEDIUM_REVENUE, LOW_REVENUE, NONE, null)
- strategic_fit: Alineacion estrategica (FULL, PARTIAL, NONE, null)
- health_score: Puntuacion de salud (0-100)
- audit_flags: Banderas de auditoria (lista de problemas detectados)`;

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
        // Build context from projects with matrix logic
        const projectsSummary = context.projects.map((p) => {
          // Determine risk classification based on matrix logic
          const capex = p.capexTier;
          const financial = p.financialImpact;
          let clasificacion = "SIN_CLASIFICAR";
          
          if (capex === "HIGH_COST" && (financial === "LOW_REVENUE" || financial === "NONE" || !financial)) {
            clasificacion = "ZOMBIE_ALTO_RIESGO";
          } else if ((capex === "LOW_COST" || capex === "ZERO_COST") && financial === "HIGH_REVENUE") {
            clasificacion = "QUICK_WIN";
          } else if (capex === "HIGH_COST" && financial === "HIGH_REVENUE") {
            clasificacion = "BIG_BET";
          } else if ((capex === "LOW_COST" || capex === "ZERO_COST") && (financial === "LOW_REVENUE" || financial === "NONE")) {
            clasificacion = "FILL_IN";
          }
          
          return {
            id: p.id,
            nombre: p.projectName || "Sin nombre",
            descripcion: p.description && p.description.length > 10 ? p.description.substring(0, 200) + "..." : "Sin detalles proporcionados",
            estado: p.status || "Sin estado",
            departamento: p.departmentName || "Sin departamento",
            responsable: p.responsible || "Sin asignar",
            sponsor: p.sponsor || "Sin sponsor",
            avance: p.percentComplete || 0,
            fechaFin: p.endDateEstimatedTbd ? "TBD" : (p.endDateEstimated || "Sin fecha"),
            capex_tier: p.capexTier || "SIN_CLASIFICAR",
            financial_impact: p.financialImpact || "SIN_CLASIFICAR",
            strategic_fit: p.strategicFit || "SIN_CLASIFICAR",
            health_score: p.healthScore ?? null,
            audit_flags: p.auditFlags || [],
            clasificacion_matriz: clasificacion,
          };
        });

        // Pre-compute portfolio statistics
        const zombies = projectsSummary.filter(p => p.clasificacion_matriz === "ZOMBIE_ALTO_RIESGO");
        const quickWins = projectsSummary.filter(p => p.clasificacion_matriz === "QUICK_WIN");
        const bigBets = projectsSummary.filter(p => p.clasificacion_matriz === "BIG_BET");
        const fillIns = projectsSummary.filter(p => p.clasificacion_matriz === "FILL_IN");
        const sinClasificar = projectsSummary.filter(p => p.clasificacion_matriz === "SIN_CLASIFICAR");
        const criticalHealth = projectsSummary.filter(p => p.health_score !== null && p.health_score < 50);
        
        const dataContext = `
DATOS ACTUALES DEL PORTAFOLIO (Version: ${context.versionFileName || "Sin version"}):
Total de proyectos: ${context.projects.length}

=== RESUMEN EJECUTIVO DE MATRIZ ===
- ZOMBIES/ALTO RIESGO (Alto Costo + Bajo Valor): ${zombies.length} proyectos
- QUICK WINS (Bajo Costo + Alto Valor): ${quickWins.length} proyectos
- BIG BETS (Alto Costo + Alto Valor): ${bigBets.length} proyectos
- FILL-INS (Bajo Costo + Bajo Valor): ${fillIns.length} proyectos
- SIN CLASIFICAR (Faltan datos): ${sinClasificar.length} proyectos
- SALUD CRITICA (score < 50): ${criticalHealth.length} proyectos

${zombies.length > 0 ? `
=== PROYECTOS ZOMBIE (REVISAR URGENTE) ===
${zombies.map(z => `- ${z.nombre} | Dept: ${z.departamento} | CAPEX: ${z.capex_tier} | Impacto: ${z.financial_impact}`).join('\n')}
` : ''}

${quickWins.length > 0 ? `
=== QUICK WINS (OPORTUNIDADES) ===
${quickWins.map(q => `- ${q.nombre} | Dept: ${q.departamento} | CAPEX: ${q.capex_tier} | Impacto: ${q.financial_impact}`).join('\n')}
` : ''}

=== DETALLE DE TODOS LOS PROYECTOS ===
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
