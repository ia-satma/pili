import { storage } from "../storage";
import { runOrchestrator } from "./orchestrator";

interface EvalFixture {
  name: string;
  mode: "BRAINSTORM" | "DECIDE" | "RISKS" | "NEXT_ACTIONS";
  initiativeId?: number;
  message: string;
  expectedHas: {
    hasSummary?: boolean;
    hasIdeas?: boolean;
    hasRisks?: boolean;
    hasNextActions?: boolean;
    insufficientEvidence?: boolean;
  };
}

const FIXTURES: EvalFixture[] = [
  {
    name: "complete_evidence",
    mode: "BRAINSTORM",
    message: "¿Qué alternativas tenemos para mejorar el proyecto?",
    expectedHas: { hasSummary: true, hasIdeas: true },
  },
  {
    name: "missing_evidence",
    mode: "DECIDE",
    message: "¿Debemos continuar con este proyecto?",
    expectedHas: { hasSummary: true, insufficientEvidence: true },
  },
  {
    name: "high_alerts",
    mode: "RISKS",
    message: "¿Cuáles son los principales riesgos?",
    expectedHas: { hasSummary: true, hasRisks: true },
  },
  {
    name: "conflicting_deltas",
    mode: "NEXT_ACTIONS",
    message: "¿Qué pasos debemos seguir dado los cambios recientes?",
    expectedHas: { hasSummary: true, hasNextActions: true },
  },
  {
    name: "benefits_missing",
    mode: "BRAINSTORM",
    message: "¿Cómo podemos demostrar el valor del proyecto?",
    expectedHas: { hasSummary: true, hasIdeas: true },
  },
];

export async function runEvalSuite(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: Array<{ fixture: string; status: string; latencyMs: number }>;
}> {
  const results: Array<{ fixture: string; status: string; latencyMs: number }> = [];
  let passed = 0;
  let failed = 0;

  for (const fixture of FIXTURES) {
    const startTime = Date.now();
    let status = "PASS";
    let outputJson: Record<string, unknown> = {};
    let notes = "";

    try {
      const response = await runOrchestrator({
        initiativeId: fixture.initiativeId,
        message: fixture.message,
        mode: fixture.mode,
      });

      outputJson = response as unknown as Record<string, unknown>;

      if (fixture.expectedHas.hasSummary && !response.summary) {
        status = "FAIL";
        notes += "Missing summary. ";
      }
      if (fixture.expectedHas.hasIdeas && response.ideas.length === 0) {
        status = "FAIL";
        notes += "Missing ideas. ";
      }
      if (fixture.expectedHas.hasRisks && response.risks.length === 0) {
        status = "FAIL";
        notes += "Missing risks. ";
      }
      if (fixture.expectedHas.hasNextActions && response.nextActions.length === 0) {
        status = "FAIL";
        notes += "Missing next actions. ";
      }
      if (fixture.expectedHas.insufficientEvidence !== undefined) {
        if (fixture.expectedHas.insufficientEvidence && !response.insufficientEvidence) {
          status = "FAIL";
          notes += "Expected insufficient evidence flag but got false. ";
        }
        if (!fixture.expectedHas.insufficientEvidence && response.insufficientEvidence) {
          status = "FAIL";
          notes += "Got unexpected insufficient evidence flag. ";
        }
      }
    } catch (error) {
      status = "ERROR";
      notes = error instanceof Error ? error.message : String(error);
    }

    const latencyMs = Date.now() - startTime;

    await storage.createEvalRun({
      suiteName: "H6_Orchestrator",
      fixtureName: fixture.name,
      mode: fixture.mode,
      status,
      startedAt: new Date(startTime),
      finishedAt: new Date(),
      latencyMs,
      notes: notes || null,
      inputJson: { message: fixture.message, initiativeId: fixture.initiativeId },
      outputJson,
    });

    if (status === "PASS") passed++;
    else failed++;

    results.push({ fixture: fixture.name, status, latencyMs });
  }

  return { total: FIXTURES.length, passed, failed, results };
}
