/**
 * Optimized Chat Service - SQL-First Aggregations
 * 
 * Instead of sending 200+ raw project rows to the LLM, we:
 * 1. Execute SQL aggregations to get a compact "cheat sheet"
 * 2. Only send the summary + top examples to the LLM
 * 3. Result: Faster responses + More accurate answers
 */

import { db } from "../db";
import { projects } from "@shared/schema";
import { sql, count, and, or, eq, isNull, lt, isNotNull } from "drizzle-orm";

export interface PortfolioSummary {
  total_projects: number;
  investment_profile: {
    high_cost_count: number;
    medium_cost_count: number;
    low_cost_count: number;
    zero_cost_count: number;
    unclassified_count: number;
  };
  value_profile: {
    high_revenue_count: number;
    medium_revenue_count: number;
    low_revenue_count: number;
    junk_count: number;
    unclassified_count: number;
  };
  strategy_gap: {
    full_fit_count: number;
    partial_fit_count: number;
    misaligned_count: number;
    unclassified_count: number;
  };
  health_profile: {
    healthy_count: number;
    needs_attention_count: number;
    critical_count: number;
    no_score_count: number;
  };
  matrix_classification: {
    zombies: number;
    quick_wins: number;
    big_bets: number;
    fill_ins: number;
    unclassified: number;
  };
  top_5_quick_wins: Array<{ id: number; name: string; department: string }>;
  top_5_zombies: Array<{ id: number; name: string; department: string; capex: string | null }>;
  top_5_critical_health: Array<{ id: number; name: string; health_score: number | null }>;
  departments_summary: Array<{ department: string; count: number }>;
}

/**
 * Get portfolio summary using SQL aggregations
 * This is the "cheat sheet" for the LLM - compact and fast
 */
export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  // Run all aggregations in parallel for speed
  const [
    totalResult,
    investmentProfile,
    valueProfile,
    strategyProfile,
    healthProfile,
    matrixCounts,
    quickWins,
    zombies,
    criticalHealth,
    departmentsSummary,
  ] = await Promise.all([
    // Total projects
    db.select({ count: count() }).from(projects).where(eq(projects.isActive, true)),

    // Investment profile (capex_tier)
    db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE capex_tier = 'HIGH_COST') as high_cost,
        COUNT(*) FILTER (WHERE capex_tier = 'MEDIUM_COST') as medium_cost,
        COUNT(*) FILTER (WHERE capex_tier = 'LOW_COST') as low_cost,
        COUNT(*) FILTER (WHERE capex_tier = 'ZERO_COST') as zero_cost,
        COUNT(*) FILTER (WHERE capex_tier IS NULL OR capex_tier = '') as unclassified
      FROM projects
      WHERE is_active = true
    `),

    // Value profile (financial_impact)
    db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE financial_impact = 'HIGH_REVENUE') as high_revenue,
        COUNT(*) FILTER (WHERE financial_impact = 'MEDIUM_REVENUE') as medium_revenue,
        COUNT(*) FILTER (WHERE financial_impact = 'LOW_REVENUE') as low_revenue,
        COUNT(*) FILTER (WHERE financial_impact = 'NONE') as junk,
        COUNT(*) FILTER (WHERE financial_impact IS NULL OR financial_impact = '') as unclassified
      FROM projects
      WHERE is_active = true
    `),

    // Strategy profile (strategic_fit)
    db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE strategic_fit = 'FULL') as full_fit,
        COUNT(*) FILTER (WHERE strategic_fit = 'PARTIAL') as partial_fit,
        COUNT(*) FILTER (WHERE strategic_fit = 'NONE') as misaligned,
        COUNT(*) FILTER (WHERE strategic_fit IS NULL OR strategic_fit = '') as unclassified
      FROM projects
      WHERE is_active = true
    `),

    // Health profile
    db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE health_score >= 80) as healthy,
        COUNT(*) FILTER (WHERE health_score >= 50 AND health_score < 80) as needs_attention,
        COUNT(*) FILTER (WHERE health_score < 50 AND health_score IS NOT NULL) as critical,
        COUNT(*) FILTER (WHERE health_score IS NULL) as no_score
      FROM projects
      WHERE is_active = true
    `),

    // Matrix classification counts
    db.execute(sql`
      SELECT 
        COUNT(*) FILTER (
          WHERE capex_tier = 'HIGH_COST' 
          AND (financial_impact = 'LOW_REVENUE' OR financial_impact = 'NONE' OR financial_impact IS NULL)
        ) as zombies,
        COUNT(*) FILTER (
          WHERE (capex_tier = 'LOW_COST' OR capex_tier = 'ZERO_COST') 
          AND financial_impact = 'HIGH_REVENUE'
        ) as quick_wins,
        COUNT(*) FILTER (
          WHERE capex_tier = 'HIGH_COST' 
          AND financial_impact = 'HIGH_REVENUE'
        ) as big_bets,
        COUNT(*) FILTER (
          WHERE (capex_tier = 'LOW_COST' OR capex_tier = 'ZERO_COST') 
          AND (financial_impact = 'LOW_REVENUE' OR financial_impact = 'NONE')
        ) as fill_ins
      FROM projects
      WHERE is_active = true
    `),

    // Top 5 Quick Wins (Low Cost + High Revenue)
    db.select({
      id: projects.id,
      name: projects.projectName,
      department: projects.departmentName,
    })
      .from(projects)
      .where(
        and(
          eq(projects.isActive, true),
          or(eq(projects.capexTier, 'LOW_COST'), eq(projects.capexTier, 'ZERO_COST')),
          eq(projects.financialImpact, 'HIGH_REVENUE')
        )
      )
      .limit(5),

    // Top 5 Zombies (High Cost + Low/No Value)
    db.select({
      id: projects.id,
      name: projects.projectName,
      department: projects.departmentName,
      capex: projects.capexTier,
    })
      .from(projects)
      .where(
        and(
          eq(projects.isActive, true),
          eq(projects.capexTier, 'HIGH_COST'),
          or(
            eq(projects.financialImpact, 'LOW_REVENUE'),
            eq(projects.financialImpact, 'NONE'),
            isNull(projects.financialImpact)
          )
        )
      )
      .limit(5),

    // Top 5 Critical Health (score < 50)
    db.select({
      id: projects.id,
      name: projects.projectName,
      health_score: projects.healthScore,
    })
      .from(projects)
      .where(
        and(
          eq(projects.isActive, true),
          isNotNull(projects.healthScore),
          lt(projects.healthScore, 50)
        )
      )
      .orderBy(projects.healthScore)
      .limit(5),

    // Departments summary
    db.execute(sql`
      SELECT 
        COALESCE(department_name, 'Sin departamento') as department,
        COUNT(*) as count
      FROM projects
      WHERE is_active = true
      GROUP BY department_name
      ORDER BY count DESC
      LIMIT 10
    `),
  ]);

  // Extract results
  const inv = investmentProfile.rows[0] as any || {};
  const val = valueProfile.rows[0] as any || {};
  const strat = strategyProfile.rows[0] as any || {};
  const health = healthProfile.rows[0] as any || {};
  const matrix = matrixCounts.rows[0] as any || {};
  const depts = (departmentsSummary.rows || []) as any[];

  // Calculate unclassified for matrix
  const classifiedCount =
    Number(matrix.zombies || 0) +
    Number(matrix.quick_wins || 0) +
    Number(matrix.big_bets || 0) +
    Number(matrix.fill_ins || 0);
  const totalCount = totalResult[0]?.count || 0;

  return {
    total_projects: totalCount,
    investment_profile: {
      high_cost_count: Number(inv.high_cost || 0),
      medium_cost_count: Number(inv.medium_cost || 0),
      low_cost_count: Number(inv.low_cost || 0),
      zero_cost_count: Number(inv.zero_cost || 0),
      unclassified_count: Number(inv.unclassified || 0),
    },
    value_profile: {
      high_revenue_count: Number(val.high_revenue || 0),
      medium_revenue_count: Number(val.medium_revenue || 0),
      low_revenue_count: Number(val.low_revenue || 0),
      junk_count: Number(val.junk || 0),
      unclassified_count: Number(val.unclassified || 0),
    },
    strategy_gap: {
      full_fit_count: Number(strat.full_fit || 0),
      partial_fit_count: Number(strat.partial_fit || 0),
      misaligned_count: Number(strat.misaligned || 0),
      unclassified_count: Number(strat.unclassified || 0),
    },
    health_profile: {
      healthy_count: Number(health.healthy || 0),
      needs_attention_count: Number(health.needs_attention || 0),
      critical_count: Number(health.critical || 0),
      no_score_count: Number(health.no_score || 0),
    },
    matrix_classification: {
      zombies: Number(matrix.zombies || 0),
      quick_wins: Number(matrix.quick_wins || 0),
      big_bets: Number(matrix.big_bets || 0),
      fill_ins: Number(matrix.fill_ins || 0),
      unclassified: totalCount - classifiedCount,
    },
    top_5_quick_wins: quickWins.map(p => ({
      id: p.id,
      name: p.name || "Sin nombre",
      department: p.department || "Sin departamento",
    })),
    top_5_zombies: zombies.map(p => ({
      id: p.id,
      name: p.name || "Sin nombre",
      department: p.department || "Sin departamento",
      capex: p.capex,
    })),
    top_5_critical_health: criticalHealth.map(p => ({
      id: p.id,
      name: p.name || "Sin nombre",
      health_score: p.health_score,
    })),
    departments_summary: depts.map(d => ({
      department: String(d.department || "Sin departamento"),
      count: Number(d.count || 0),
    })),
  };
}

/**
 * Format portfolio summary as LLM-friendly context
 * Much more compact than sending 200+ raw project rows
 */
export function formatSummaryForLLM(summary: PortfolioSummary): string {
  return `
=== RESUMEN EJECUTIVO DEL PORTAFOLIO (SQL-Aggregated) ===
Total de Proyectos: ${summary.total_projects}

--- PERFIL DE INVERSION (capex_tier) ---
- HIGH_COST (>$100k): ${summary.investment_profile.high_cost_count} proyectos
- MEDIUM_COST ($20k-$100k): ${summary.investment_profile.medium_cost_count} proyectos
- LOW_COST ($5k-$20k): ${summary.investment_profile.low_cost_count} proyectos
- ZERO_COST (<$5k): ${summary.investment_profile.zero_cost_count} proyectos
- Sin clasificar: ${summary.investment_profile.unclassified_count} proyectos

--- PERFIL DE VALOR (financial_impact) ---
- HIGH_REVENUE (>$300k): ${summary.value_profile.high_revenue_count} proyectos
- MEDIUM_REVENUE ($100k-$300k): ${summary.value_profile.medium_revenue_count} proyectos
- LOW_REVENUE (<$100k): ${summary.value_profile.low_revenue_count} proyectos
- NONE (Sin beneficio): ${summary.value_profile.junk_count} proyectos
- Sin clasificar: ${summary.value_profile.unclassified_count} proyectos

--- ALINEACION ESTRATEGICA (strategic_fit) ---
- FULL (Alineado): ${summary.strategy_gap.full_fit_count} proyectos
- PARTIAL (Parcial): ${summary.strategy_gap.partial_fit_count} proyectos
- NONE (Desalineado): ${summary.strategy_gap.misaligned_count} proyectos (RIESGO)
- Sin clasificar: ${summary.strategy_gap.unclassified_count} proyectos

--- SALUD DEL PORTAFOLIO ---
- Saludables (80-100): ${summary.health_profile.healthy_count} proyectos
- Requieren atencion (50-79): ${summary.health_profile.needs_attention_count} proyectos
- CRITICOS (<50): ${summary.health_profile.critical_count} proyectos
- Sin score: ${summary.health_profile.no_score_count} proyectos

--- CLASIFICACION DE MATRIZ ---
- ZOMBIES (Alto Costo + Bajo Valor): ${summary.matrix_classification.zombies} proyectos [REVISAR URGENTE]
- QUICK WINS (Bajo Costo + Alto Valor): ${summary.matrix_classification.quick_wins} proyectos [OPORTUNIDAD]
- BIG BETS (Alto Costo + Alto Valor): ${summary.matrix_classification.big_bets} proyectos
- FILL-INS (Bajo Costo + Bajo Valor): ${summary.matrix_classification.fill_ins} proyectos
- Sin clasificar: ${summary.matrix_classification.unclassified} proyectos

${summary.top_5_zombies.length > 0 ? `
--- TOP 5 ZOMBIES (Revisar Urgente) ---
${summary.top_5_zombies.map((z, i) => `${i + 1}. "${z.name}" - ${z.department}`).join('\n')}
` : ''}

${summary.top_5_quick_wins.length > 0 ? `
--- TOP 5 QUICK WINS (Oportunidades) ---
${summary.top_5_quick_wins.map((q, i) => `${i + 1}. "${q.name}" - ${q.department}`).join('\n')}
` : ''}

${summary.top_5_critical_health.length > 0 ? `
--- TOP 5 PROYECTOS EN RIESGO CRITICO ---
${summary.top_5_critical_health.map((c, i) => `${i + 1}. "${c.name}" - Health Score: ${c.health_score}`).join('\n')}
` : ''}

--- DISTRIBUCION POR DEPARTAMENTO (Top 10) ---
${summary.departments_summary.map(d => `- ${d.department}: ${d.count} proyectos`).join('\n')}
`.trim();
}
