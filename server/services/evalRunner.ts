import { storage } from "../storage";
import { runOrchestrator } from "./orchestrator";
import { EVAL_FIXTURES, EvalFixture } from "../evals/fixtures";

export async function runEvalSuite(): Promise<{
  total: number;
  passed: number;
  failed: number;
  errors: number;
  results: Array<{ fixture: string; status: string; latencyMs: number; notes: string }>;
}> {
  const results: Array<{ fixture: string; status: string; latencyMs: number; notes: string }> = [];
  let passed = 0, failed = 0, errors = 0;

  const initiatives = await storage.getInitiatives();
  const firstInitiativeId = initiatives[0]?.id;

  for (const fixture of EVAL_FIXTURES) {
    const startTime = Date.now();
    let status = "PASS";
    let notes = "";
    let output: Record<string, unknown> | null = null;

    try {
      const initiativeId = fixture.initiativeId ? firstInitiativeId : undefined;
      
      const orchestratorOutput = await runOrchestrator({
        initiativeId,
        message: fixture.message,
        mode: fixture.mode,
      });

      output = orchestratorOutput as unknown as Record<string, unknown>;

      const checks: string[] = [];
      if (fixture.expectedBehavior.shouldHaveEvidence && !orchestratorOutput.evidenceRefs) {
        checks.push("Expected evidence refs but got none");
      }
      if (fixture.expectedBehavior.shouldHaveIdeas && orchestratorOutput.ideas.length === 0) {
        checks.push("Expected ideas but got none");
      }
      if (fixture.expectedBehavior.shouldHaveRisks && orchestratorOutput.risks.length === 0) {
        checks.push("Expected risks but got none");
      }
      if (fixture.expectedBehavior.shouldHaveNextActions && orchestratorOutput.nextActions.length === 0) {
        checks.push("Expected next actions but got none");
      }
      if (fixture.expectedBehavior.shouldAskQuestions && orchestratorOutput.questionsToClairfy.length === 0) {
        checks.push("Expected clarifying questions but got none");
      }
      if (!fixture.expectedBehavior.shouldHaveEvidence && orchestratorOutput.evidenceRefs) {
        checks.push("Expected no evidence refs but got some");
      }

      if (checks.length > 0) {
        status = "FAIL";
        notes = checks.join("; ");
        failed++;
      } else {
        notes = "All checks passed";
        passed++;
      }
    } catch (err) {
      status = "ERROR";
      notes = err instanceof Error ? err.message : String(err);
      errors++;
    }

    const latencyMs = Date.now() - startTime;

    await storage.createEvalRun({
      suiteName: "orchestrator_v1",
      fixtureName: fixture.name,
      mode: fixture.mode,
      status,
      startedAt: new Date(startTime),
      finishedAt: new Date(),
      latencyMs,
      success: status === "PASS",
      notes: { message: notes },
      outputJson: output,
    });

    results.push({ fixture: fixture.name, status, latencyMs, notes });
  }

  return { total: EVAL_FIXTURES.length, passed, failed, errors, results };
}
