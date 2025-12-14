import { storage } from "../storage";

const MONTHLY_COST_THRESHOLD_USD = 100;
const P95_LATENCY_THRESHOLD_MS = 2000;
const LATENCY_SAMPLE_SIZE = 100;

export async function checkMonthlyCostGuardrail(): Promise<void> {
  try {
    const monthlyCost = await storage.getMonthlyAgentCost();
    
    if (monthlyCost > MONTHLY_COST_THRESHOLD_USD) {
      console.warn(`[CostGuardrail] Monthly AI cost exceeded $${MONTHLY_COST_THRESHOLD_USD}: $${monthlyCost.toFixed(2)}`);
    }
  } catch (error) {
    console.error("[CostGuardrail] Error checking monthly cost:", error);
  }
}

export async function checkP95LatencyGuardrail(): Promise<void> {
  try {
    const latencies = await storage.getRecentApiLatencies(LATENCY_SAMPLE_SIZE);
    
    if (latencies.length === 0) {
      return;
    }
    
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Latency = sorted[Math.min(p95Index, sorted.length - 1)];
    
    if (p95Latency > P95_LATENCY_THRESHOLD_MS) {
      console.warn(`[LatencyGuardrail] P95 API latency exceeded ${P95_LATENCY_THRESHOLD_MS}ms: ${p95Latency}ms`);
    }
  } catch (error) {
    console.error("[LatencyGuardrail] Error checking P95 latency:", error);
  }
}

export async function runGuardrailChecks(): Promise<void> {
  await Promise.all([
    checkMonthlyCostGuardrail(),
    checkP95LatencyGuardrail(),
  ]);
}
