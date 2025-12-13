import { storage } from "../storage";
import { buildEvidencePack, formatEvidenceForPrompt } from "./evidencePack";
import { isOpenAIConfigured } from "../openai";
import OpenAI from "openai";
import type { AgentRun, CouncilReview } from "@shared/schema";

const MODEL = "gpt-5";

type AgentRunStatus = "RUNNING" | "SUCCEEDED" | "BLOCKED" | "FAILED";

interface AgentRunResult {
  runId: number;
  status: AgentRunStatus;
  outputJson: Record<string, unknown> | null;
  reviews: CouncilReview[];
  blockedReason?: string;
}

const openai = isOpenAIConfigured()
  ? new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    })
  : null;

export async function runAgent(
  agentName: string,
  initiativeId: number
): Promise<AgentRunResult> {
  const agentDef = await storage.getAgentDefinitionByName(agentName);
  if (!agentDef) {
    throw new Error(`Agente no encontrado: ${agentName}`);
  }

  const activeVersion = await storage.getActiveAgentVersion(agentName);
  if (!activeVersion) {
    throw new Error(`No hay versión activa para el agente: ${agentName}`);
  }

  if (!agentDef.enabled) {
    const run = await storage.createAgentRun({
      agentVersionId: activeVersion.id,
      initiativeId,
      status: "BLOCKED",
      inputJson: { initiativeId },
      outputJson: null,
      errorMessage: `Agente '${agentName}' está deshabilitado`,
    });

    return {
      runId: run.id,
      status: "BLOCKED",
      outputJson: null,
      reviews: [],
      blockedReason: `Agente '${agentName}' está deshabilitado`,
    };
  }

  const evidencePack = await buildEvidencePack(initiativeId);
  if (!evidencePack) {
    throw new Error(`Iniciativa no encontrada: ${initiativeId}`);
  }

  const evidenceText = formatEvidenceForPrompt(evidencePack);
  const promptTemplate = activeVersion.promptTemplate || "{{EVIDENCE}}";
  const fullPrompt = promptTemplate.replace("{{EVIDENCE}}", evidenceText);

  const run = await storage.createAgentRun({
    agentVersionId: activeVersion.id,
    initiativeId,
    status: "RUNNING",
    inputJson: {
      initiativeId,
      provenanceBatchIds: evidencePack.provenance.batchIds,
      provenanceSnapshotIds: evidencePack.provenance.snapshotIds,
    },
    evidenceRefsJson: {
      batchIds: evidencePack.provenance.batchIds,
      snapshotIds: evidencePack.provenance.snapshotIds,
    },
    outputJson: null,
    startedAt: new Date(),
  });

  let outputJson: Record<string, unknown> | null = null;
  let agentError: string | null = null;

  if (!openai) {
    agentError = "OpenAI no está configurado";
  } else {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `Eres un agente del sistema PMO. Tu rol: ${agentDef.purpose || agentName}. 
REGLAS ESTRICTAS:
1. SOLO usa datos de la evidencia proporcionada
2. NUNCA inventes datos o hagas suposiciones
3. Cita siempre los IDs de donde proviene la información
4. Responde en español`,
          },
          {
            role: "user",
            content: fullPrompt,
          },
        ],
        max_completion_tokens: 4096,
      });

      const outputText = response.choices[0]?.message?.content || "";
      outputJson = { text: outputText };
    } catch (err) {
      agentError = err instanceof Error ? err.message : String(err);
    }
  }

  if (agentError) {
    await storage.updateAgentRun(run.id, {
      status: "FAILED",
      outputJson: { error: agentError },
      errorMessage: agentError,
      finishedAt: new Date(),
    });

    return {
      runId: run.id,
      status: "FAILED",
      outputJson: { error: agentError },
      reviews: [],
    };
  }

  await storage.updateAgentRun(run.id, {
    outputJson,
  });

  const reviews = await runCouncilReviews(run.id);

  const hasBlockedReview = reviews.some((r) => r.status === "BLOCKED");
  const hasRejectReview = reviews.some((r) => r.status === "NEEDS_REVISION");

  let finalStatus: AgentRunStatus = "SUCCEEDED";
  if (hasBlockedReview) {
    finalStatus = "BLOCKED";
  } else if (hasRejectReview) {
    finalStatus = "FAILED";
  }

  await storage.updateAgentRun(run.id, {
    status: finalStatus,
    finishedAt: new Date(),
  });

  return {
    runId: run.id,
    status: finalStatus,
    outputJson,
    reviews,
    blockedReason: hasBlockedReview
      ? reviews.find((r) => r.status === "BLOCKED")?.notes || "Revisión bloqueada"
      : undefined,
  };
}

async function runCouncilReviews(agentRunId: number): Promise<CouncilReview[]> {
  const reviews: CouncilReview[] = [];

  const chairmanReview = await storage.createCouncilReview({
    agentRunId,
    reviewerType: "CHAIRMAN",
    status: "APPROVED",
    notes: "Generador principal - aprobación automática",
  });
  reviews.push(chairmanReview);

  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  if (!hasAnthropicKey) {
    const criticReview = await storage.createCouncilReview({
      agentRunId,
      reviewerType: "CRITIC",
      status: "BLOCKED",
      notes: "ANTHROPIC_API_KEY no configurada - revisión no disponible",
    });
    reviews.push(criticReview);
  } else {
    const criticReview = await storage.createCouncilReview({
      agentRunId,
      reviewerType: "CRITIC",
      status: "APPROVED",
      notes: "Revisión de Claude pendiente - aprobado por defecto",
    });
    reviews.push(criticReview);
  }

  const hasGoogleKey = !!process.env.GOOGLE_API_KEY;
  if (!hasGoogleKey) {
    const quantReview = await storage.createCouncilReview({
      agentRunId,
      reviewerType: "QUANT",
      status: "BLOCKED",
      notes: "GOOGLE_API_KEY no configurada - revisión no disponible",
    });
    reviews.push(quantReview);
  } else {
    const quantReview = await storage.createCouncilReview({
      agentRunId,
      reviewerType: "QUANT",
      status: "APPROVED",
      notes: "Revisión de Gemini pendiente - aprobado por defecto",
    });
    reviews.push(quantReview);
  }

  return reviews;
}

export async function getAgentRunWithReviews(runId: number): Promise<{
  run: AgentRun | undefined;
  reviews: CouncilReview[];
}> {
  const run = await storage.getAgentRun(runId);
  if (!run) {
    return { run: undefined, reviews: [] };
  }

  const reviews = await storage.getCouncilReviewsByRunId(runId);
  return { run, reviews };
}
