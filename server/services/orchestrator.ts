import { buildEvidencePack, formatEvidenceForPrompt, EvidencePack } from "./evidencePack";
import OpenAI from "openai";

const MODEL = "gpt-5";

type OrchestratorMode = "BRAINSTORM" | "DECIDE" | "RISKS" | "NEXT_ACTIONS";

interface OrchestratorRequest {
  initiativeId?: number;
  message: string;
  mode: OrchestratorMode;
}

interface OrchestratorResponse {
  summary: string;
  ideas: string[];
  risks: string[];
  nextActions: string[];
  questionsToClairfy: string[];
  evidenceRefs: {
    batchIds: number[];
    snapshotIds: number[];
    alertIds: number[];
    deltaIds: number[];
  } | null;
  insufficientEvidence: boolean;
  missingFields: string[];
}

const openai = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ? new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    })
  : null;

function getModePrompt(mode: OrchestratorMode): string {
  switch (mode) {
    case "BRAINSTORM":
      return "Genera ideas creativas y alternativas para abordar la situación. Enfócate en posibilidades y opciones.";
    case "DECIDE":
      return "Ayuda a tomar una decisión estructurada. Presenta pros, contras y recomendación clara.";
    case "RISKS":
      return "Identifica y analiza riesgos potenciales. Proporciona mitigaciones sugeridas.";
    case "NEXT_ACTIONS":
      return "Define los próximos pasos concretos y priorizados. Incluye responsables sugeridos y plazos.";
  }
}

export async function runOrchestrator(req: OrchestratorRequest): Promise<OrchestratorResponse> {
  let evidencePack: EvidencePack | null = null;
  let evidenceText = "";
  
  if (req.initiativeId) {
    evidencePack = await buildEvidencePack(req.initiativeId);
    if (evidencePack) {
      evidenceText = formatEvidenceForPrompt(evidencePack);
    }
  }
  
  const hasEvidence = evidencePack !== null;
  const modeInstruction = getModePrompt(req.mode);
  
  const systemPrompt = `Eres el Orquestador PMO, un asistente estratégico para gestión de proyectos.
REGLAS ESTRICTAS:
1. SOLO usa datos de la evidencia proporcionada (si existe)
2. NUNCA inventes datos o hagas suposiciones sobre métricas
3. Si no hay contexto de proyecto, indica claramente que estás operando sin datos específicos
4. Responde SIEMPRE en español
5. Responde en formato JSON válido

MODO ACTUAL: ${req.mode}
${modeInstruction}

FORMATO DE RESPUESTA (JSON):
{
  "summary": "Resumen ejecutivo en 2-3 oraciones",
  "ideas": ["Idea 1", "Idea 2", ...],
  "risks": ["Riesgo 1", "Riesgo 2", ...],
  "nextActions": ["Acción 1", "Acción 2", ...],
  "questionsToClairfy": ["Pregunta 1", "Pregunta 2", ...],
  "insufficientEvidence": boolean,
  "missingFields": ["Campo que falta 1", ...]
}`;

  const userPrompt = hasEvidence
    ? `${evidenceText}\n\nCONSULTA DEL USUARIO:\n${req.message}`
    : `SIN CONTEXTO DE PROYECTO (ideación general)\n\nCONSULTA DEL USUARIO:\n${req.message}`;

  if (!openai) {
    return {
      summary: "Orquestador no disponible - OpenAI no configurado",
      ideas: [],
      risks: [],
      nextActions: [],
      questionsToClairfy: ["¿Puedes contactar al administrador para configurar OpenAI?"],
      evidenceRefs: null,
      insufficientEvidence: true,
      missingFields: ["OpenAI API Key"],
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return {
      summary: parsed.summary || "",
      ideas: parsed.ideas || [],
      risks: parsed.risks || [],
      nextActions: parsed.nextActions || [],
      questionsToClairfy: parsed.questionsToClairfy || parsed.questionsToClairfy || [],
      evidenceRefs: evidencePack ? evidencePack.provenance : null,
      insufficientEvidence: parsed.insufficientEvidence || false,
      missingFields: parsed.missingFields || [],
    };
  } catch (error) {
    console.error("Orchestrator error:", error);
    return {
      summary: "Error al procesar la solicitud",
      ideas: [],
      risks: [],
      nextActions: [],
      questionsToClairfy: [],
      evidenceRefs: null,
      insufficientEvidence: true,
      missingFields: ["Error de procesamiento"],
    };
  }
}
