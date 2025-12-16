import { db } from "../db";
import { projects } from "@shared/schema";
import { eq, and, or, isNotNull } from "drizzle-orm";
import type { Project } from "@shared/schema";

/**
 * ============================================================================
 * PORTFOLIO STRATEGIC INSIGHTS ENGINE
 * ============================================================================
 * 
 * Analyzes the entire portfolio using the PMO Scoring Matrix to identify:
 * - Quick Wins: Low cost, high revenue projects (fast-track candidates)
 * - Value Destroyers: High cost, low value projects (cancellation candidates)
 * - Strategic Misfits: Projects with no strategic alignment
 * - Zombies: Stale projects consuming resources
 * 
 * MATRIX LOGIC:
 * ┌─────────────────┬─────────────────┬─────────────────┐
 * │ CAPEX / Revenue │   HIGH_REVENUE  │   LOW/NONE      │
 * ├─────────────────┼─────────────────┼─────────────────┤
 * │ LOW/ZERO_COST   │  💎 QUICK WIN   │ Fill-In         │
 * │ MEDIUM_COST     │  Big Bet        │ ⚠️ Monitor      │
 * │ HIGH_COST       │  Strategic Bet  │ 💀 VALUE KILLER │
 * └─────────────────┴─────────────────┴─────────────────┘
 * ============================================================================
 */

export interface PortfolioInsight {
  id: number;
  projectName: string;
  departmentName: string | null;
  capexTier: string | null;
  financialImpact: string | null;
  strategicFit: string | null;
  status: string | null;
  reason: string;
}

export interface PortfolioInsightsResult {
  quickWins: PortfolioInsight[];
  zombiesToKill: PortfolioInsight[];
  strategicMisalignment: PortfolioInsight[];
  valueBets: PortfolioInsight[];
  summary: {
    totalAnalyzed: number;
    quickWinsCount: number;
    zombiesCount: number;
    misalignedCount: number;
    valueBetsCount: number;
    portfolioHealthScore: number;
  };
  generatedAt: string;
}

/**
 * Analyzes the entire portfolio and returns strategic insights
 */
export async function getPortfolioInsights(): Promise<PortfolioInsightsResult> {
  const allProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.isActive, true));

  const quickWins: PortfolioInsight[] = [];
  const zombiesToKill: PortfolioInsight[] = [];
  const strategicMisalignment: PortfolioInsight[] = [];
  const valueBets: PortfolioInsight[] = [];

  for (const project of allProjects) {
    const capexTier = project.capexTier;
    const financialImpact = project.financialImpact;
    const strategicFit = project.strategicFit;
    const status = (project.status || "").toLowerCase();

    const insight: PortfolioInsight = {
      id: project.id,
      projectName: project.projectName || "Sin nombre",
      departmentName: project.departmentName,
      capexTier,
      financialImpact,
      strategicFit,
      status: project.status,
      reason: "",
    };

    // Skip closed/cancelled projects
    if (status.includes("cerrado") || status.includes("cancelado") || status.includes("terminado")) {
      continue;
    }

    // -------------------------------------------------------------------------
    // QUICK WINS: Low/Zero Cost + High Revenue
    // -------------------------------------------------------------------------
    if (
      (capexTier === "LOW_COST" || capexTier === "ZERO_COST") &&
      financialImpact === "HIGH_REVENUE"
    ) {
      quickWins.push({
        ...insight,
        reason: "Bajo costo + Alto beneficio = Candidato para fast-track",
      });
      continue;
    }

    // -------------------------------------------------------------------------
    // VALUE DESTROYERS (Zombies to Kill): High Cost + Low/None Revenue
    // -------------------------------------------------------------------------
    if (
      capexTier === "HIGH_COST" &&
      (financialImpact === "LOW_REVENUE" || financialImpact === "NONE" || !financialImpact)
    ) {
      zombiesToKill.push({
        ...insight,
        reason: "Alta inversión (>$100k) sin beneficio claro = Candidato para cancelación o replanteamiento",
      });
      continue;
    }

    // -------------------------------------------------------------------------
    // STRATEGIC MISALIGNMENT: No strategic fit + High Cost
    // -------------------------------------------------------------------------
    if (strategicFit === "NONE" && (capexTier === "HIGH_COST" || capexTier === "MEDIUM_COST")) {
      strategicMisalignment.push({
        ...insight,
        reason: "Sin alineación estratégica + Inversión significativa = Requiere caso de negocio o deprioritizar",
      });
      continue;
    }

    // -------------------------------------------------------------------------
    // VALUE BETS: High Cost + High Revenue + Strategic Alignment
    // -------------------------------------------------------------------------
    if (
      capexTier === "HIGH_COST" &&
      financialImpact === "HIGH_REVENUE" &&
      strategicFit === "FULL"
    ) {
      valueBets.push({
        ...insight,
        reason: "Alta inversión + Alto retorno + Alineación estratégica = Apuesta de valor",
      });
    }
  }

  // Calculate portfolio health score
  const totalWithData = allProjects.filter(p => {
    const capex = p.capexTier;
    const impact = p.financialImpact;
    return capex || impact;
  }).length;

  const problematicCount = zombiesToKill.length + strategicMisalignment.length;
  const positiveCount = quickWins.length + valueBets.length;

  let portfolioHealthScore = 50; // Neutral baseline
  if (totalWithData > 0) {
    const positiveRatio = positiveCount / totalWithData;
    const negativeRatio = problematicCount / totalWithData;
    portfolioHealthScore = Math.round(50 + (positiveRatio * 50) - (negativeRatio * 50));
    portfolioHealthScore = Math.max(0, Math.min(100, portfolioHealthScore));
  }

  return {
    quickWins,
    zombiesToKill,
    strategicMisalignment,
    valueBets,
    summary: {
      totalAnalyzed: allProjects.length,
      quickWinsCount: quickWins.length,
      zombiesCount: zombiesToKill.length,
      misalignedCount: strategicMisalignment.length,
      valueBetsCount: valueBets.length,
      portfolioHealthScore,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate AI-powered portfolio recommendations
 * Returns structured recommendations for the PMO chatbot
 */
export function getMatrixContextForAI(project: Project): string {
  const capexTier = project.capexTier;
  const financialImpact = project.financialImpact;
  const strategicFit = project.strategicFit;

  const lines: string[] = [];

  // CAPEX Analysis
  if (capexTier) {
    switch (capexTier) {
      case "HIGH_COST":
        lines.push("⚠️ INVERSIÓN ALTA (>$100k USD): Este proyecto requiere una inversión significativa.");
        break;
      case "MEDIUM_COST":
        lines.push("📊 INVERSIÓN MEDIA ($20k-$100k USD): Inversión moderada.");
        break;
      case "LOW_COST":
      case "ZERO_COST":
        lines.push("✅ INVERSIÓN BAJA/NULA: Proyecto de bajo costo.");
        break;
    }
  }

  // Financial Impact Analysis
  if (financialImpact) {
    switch (financialImpact) {
      case "HIGH_REVENUE":
        lines.push("💰 BENEFICIO ALTO (>$300k USD): Alto retorno esperado.");
        break;
      case "MEDIUM_REVENUE":
        lines.push("📈 BENEFICIO MEDIO ($100k-$300k USD): Retorno moderado esperado.");
        break;
      case "LOW_REVENUE":
      case "NONE":
        lines.push("📉 BENEFICIO BAJO/NULO: Sin retorno financiero directo significativo.");
        break;
    }
  }

  // Strategic Fit Analysis
  if (strategicFit) {
    switch (strategicFit) {
      case "FULL":
        lines.push("🎯 ALINEACIÓN TOTAL: Proyecto alineado con objetivos estratégicos.");
        break;
      case "PARTIAL":
        lines.push("⚡ ALINEACIÓN PARCIAL: Contribuye parcialmente a objetivos estratégicos.");
        break;
      case "NONE":
        lines.push("❌ SIN ALINEACIÓN: No contribuye a objetivos estratégicos actuales.");
        break;
    }
  }

  // Matrix Classification
  if (capexTier && financialImpact) {
    const isLowCost = capexTier === "LOW_COST" || capexTier === "ZERO_COST";
    const isHighCost = capexTier === "HIGH_COST";
    const isHighRevenue = financialImpact === "HIGH_REVENUE";
    const isLowRevenue = financialImpact === "LOW_REVENUE" || financialImpact === "NONE";

    if (isLowCost && isHighRevenue) {
      lines.push("\n💎 CLASIFICACIÓN: QUICK WIN - Recomendar fast-tracking y priorización.");
    } else if (isHighCost && isLowRevenue) {
      lines.push("\n💀 CLASIFICACIÓN: VALUE DESTROYER - Considerar cancelación o drástico replanteamiento del alcance.");
    } else if (isHighCost && isHighRevenue) {
      lines.push("\n🎲 CLASIFICACIÓN: BIG BET - Apuesta estratégica que requiere supervisión cercana.");
    }
  }

  // Strategic Fit Warning
  if (strategicFit === "NONE" && (capexTier === "HIGH_COST" || capexTier === "MEDIUM_COST")) {
    lines.push("\n⚠️ ALERTA: Proyecto con inversión significativa sin alineación estratégica. Requiere justificación de caso de negocio o deprioritización.");
  }

  return lines.join("\n");
}

/**
 * System prompt enhancement for portfolio-aware AI responses
 */
export const PORTFOLIO_MATRIX_CONTEXT = `
CONTEXTO DE MATRIZ DE PORTAFOLIO PMO:

Cuando analices proyectos, considera estas reglas de la Matriz Valor/Esfuerzo:

1. QUICK WINS (💎): Si capex_tier es 'LOW_COST' o 'ZERO_COST' Y financial_impact es 'HIGH_REVENUE':
   → Recomienda fast-tracking y priorización inmediata.
   → Estos proyectos tienen el mejor ROI del portafolio.

2. VALUE DESTROYERS (💀): Si capex_tier es 'HIGH_COST' (>$100k USD) Y financial_impact es 'LOW_REVENUE' o 'NONE':
   → Recomienda cancelación inmediata o replanteamiento drástico del alcance.
   → Estos proyectos destruyen valor del portafolio.

3. ALINEACIÓN ESTRATÉGICA: Si strategic_fit es 'NONE':
   → Independientemente del ROI, recomienda crear un caso de negocio formal o deprioritizar.
   → Proyectos sin alineación estratégica deben ser cuestionados.

4. BIG BETS (🎲): Si capex_tier es 'HIGH_COST' Y financial_impact es 'HIGH_REVENUE':
   → Proyectos de alto riesgo/alto retorno que requieren supervisión ejecutiva cercana.
   → Recomienda hitos de validación y puntos de no-retorno definidos.

Siempre fundamenta tus recomendaciones en estos criterios objetivos del portafolio.
`;
