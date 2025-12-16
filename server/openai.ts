// Using Replit AI Integrations for Gemini
// This uses Replit's AI Integrations service, which provides Gemini-compatible API access
// without requiring your own API key. Charges are billed to your Replit credits.
import { GoogleGenAI } from "@google/genai";
import type { Project } from "@shared/schema";
import { getPortfolioSummary, formatSummaryForLLM } from "./services/chatService";

// Use Gemini 2.5 Pro for maximum reasoning capability
const MODEL_NAME = "gemini-2.5-pro";

const isConfigured = !!(process.env.AI_INTEGRATIONS_GEMINI_BASE_URL && process.env.AI_INTEGRATIONS_GEMINI_API_KEY);

const genAI = isConfigured ? new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
  httpOptions: { baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL },
}) : null;

export function isOpenAIConfigured(): boolean {
  return isConfigured;
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
  if (!genAI) {
    return {
      content: "El asistente PMO Bot no está configurado. Por favor contacta al administrador para habilitar la integración con Gemini.",
      citations: [],
    };
  }

  // NATIVE RETRY LOGIC
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

      const prompt = `${SYSTEM_PROMPT}\n\nCONTEXTO DE DATOS:\n${dataContext}\n\nPREGUNTA USUARIO:\n${userMessage}`;

      const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text || "";

      try {
        const parsed = JSON.parse(text);
        return {
          content: parsed.respuesta || parsed.response || parsed.content || text,
          citations: (parsed.citas || parsed.citations || []).map((c: any) => ({
            sheet: c.sheet || c.hoja,
            row: c.row || c.fila,
            column: c.column || c.columna,
            value: c.value || c.valor,
          })),
        };
      } catch {
        return {
          content: text,
          citations: [],
        };
      }

    } catch (error) {
      console.error(`[PMO Bot] Gemini Attempt ${attempt} failed:`, error);
      lastError = error;

      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
