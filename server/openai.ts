// Using javascript_openai_ai_integrations blueprint
// This uses Replit's AI Integrations service, which provides OpenAI-compatible API access
// without requiring your own API key. Charges are billed to your Replit credits.
import OpenAI from "openai";

import type { Project } from "@shared/schema";
import { getPortfolioSummary, formatSummaryForLLM } from "./services/chatService";

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

REGLAS ESTRICTAS DE DATOS (CRITICO):
1. **NO TIENES ACCESO A MONTOS EXACTOS EN DOLARES.** Solo tienes "Tallas" o Categorias (Tags).
   - SI te preguntan "¿Cuanto dinero?", responde con la CANTIDAD de proyectos en cada categoria (Ej: "Hay 5 proyectos HIGH_COST").
   - NUNCA intentes sumar, promediar o hacer matematicas con las etiquetas como "HIGH_COST".
   - NUNCA inventes cifras. Si no esta en el texto, no existe.

2. **LOGICA DE CONTEO (FRECUENCIA):**
   - Tu principal herramienta es el CONTEO de proyectos por categoria.
   - Usa los resumenes proporcionados para dar respuestas macro (Ej: "El 20% del portafolio es de Alto Costo").

COMO INTERPRETAR LAS ETIQUETAS (TAGS):

**Inversion (capex_tier):**
- HIGH_COST: Proyectos de alta inversion (Talla XL)
- MEDIUM_COST: Inversion moderada (Talla M/L)
- LOW_COST: Bajo costo (Talla S)
- ZERO_COST: Sin costo directo (Talla XS)

**Impacto Financiero (financial_impact):**
- HIGH_REVENUE: Alto retorno esperado (Genera mucho valor)
- MEDIUM_REVENUE: Valor moderado
- LOW_REVENUE: Bajo retorno
- NONE: Sin beneficio financiero directo (Posible desperdicio o habilitador)

**Clasificacion Estrategica (Combinando Tags):**
- **ZOMBIES:** (High Cost + Low/No Revenue) -> Proyectos caros que no dan valor.
- **QUICK WINS:** (Low/Zero Cost + High Revenue) -> Proyectos baratos que dan mucho valor.

CAPACIDADES:
- Analizar el portafolio completo o por filtros usando los conteos.
- Identificar proyectos riesgosos (zombies) y oportunidades (quick wins) basandote en los TAGS.
- Responder sobre estado, fechas, responsables, departamentos.
- Dar resumen ejecutivo del portafolio.

FORMATO DE RESPUESTA (JSON OBLIGATORIO):
{
  "respuesta": "Tu analisis aqui...",
  "citas": [{"proyecto": "Nombre Proyecto", "campo": "capex_tier", "valor": "HIGH_COST"}]
}

DATOS DISPONIBLES POR PROYECTO:
- projectName: Nombre del proyecto
- description: Descripcion
- status: Estado actual
- departmentName: Departamento
- responsible: Responsable asignado
- capex_tier: ETIQUETA de Inversion (TEXTO)
- financial_impact: ETIQUETA de Impacto (TEXTO)
- health_score: Puntuacion de salud (0-100)
- audit_flags: Advertencias`;

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

  // NATIVE RETRY LOGIC - Removed p-retry/p-limit to ensure stability
  let lastError: unknown;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // SQL-FIRST OPTIMIZATION
      const portfolioSummary = await getPortfolioSummary();
      const sqlAggregatedContext = formatSummaryForLLM(portfolioSummary);

      const relevantProjects = context.projects.slice(0, 20).map((p) => ({
        id: p.id,
        nombre: p.projectName || "Sin nombre",
        estado: p.status || "Sin estado",
        departamento: p.departmentName || "Sin departamento",
        responsable: p.responsible || "Sin asignar",
        avance: p.percentComplete || 0,
        capex_tier: p.capexTier || null,
        financial_impact: p.financialImpact || null,
        strategic_fit: p.strategicFit || null,
      }));

      const dataContext = `
${sqlAggregatedContext}

--- MUESTRA DE PROYECTOS (Primeros 20 para referencia) ---
${JSON.stringify(relevantProjects, null, 2)}

NOTA: Para preguntas sobre proyectos especificos por nombre, usa los datos del resumen.
Para conteos y estadisticas, usa SIEMPRE los numeros del resumen SQL (son exactos).
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
        return {
          content: content,
          citations: [],
        };
      }

    } catch (error) {
      console.error(`[PMO Bot] Attempt ${attempt} failed:`, error);
      lastError = error;

      // Don't wait on last attempt
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // If we get here, all retries failed
  throw lastError;
}
