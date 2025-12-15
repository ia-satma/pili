import { db } from "../db";
import { projects } from "@shared/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

/**
 * ============================================================================
 * ORCHESTRATOR AGENT v2.0 - STRATEGIC INNOVATION PARTNER
 * ============================================================================
 * 
 * Rewired to read new schema fields:
 * - description: The "meat" of the project - problem statement and approach
 * - value_proposition: Business case and expected benefits
 * - financial_impact: HIGH_REVENUE, MEDIUM_REVENUE, LOW_REVENUE, NONE
 * - strategic_fit: FULL, PARTIAL, NONE
 * - capex_tier: HIGH_COST, MEDIUM_COST, LOW_COST, ZERO_COST
 * 
 * FALLBACK: If description is short (<50 chars), generates ideas based on title
 * ============================================================================
 */

const MODEL = "gpt-4o";

type OrchestratorMode = "BRAINSTORM" | "DECIDE" | "RISKS" | "NEXT_ACTIONS";

interface OrchestratorRequest {
  projectId?: number;
  message: string;
  mode: OrchestratorMode;
}

interface OrchestratorResponse {
  summary: string;
  ideas: string[];
  risks: string[];
  nextActions: string[];
  questionsToClairfy: string[];
  projectContext: {
    name: string | null;
    description: string | null;
    financialAmbition: string | null;
    strategicAlignment: string | null;
    investmentLevel: string | null;
  } | null;
  insufficientEvidence: boolean;
  fallbackMode: boolean;
  missingFields: string[];
}

interface ProjectContext {
  id: number;
  projectName: string | null;
  description: string | null;
  problemStatement: string | null;
  objective: string | null;
  benefits: string | null;
  financialImpact: string | null;
  strategicFit: string | null;
  capexTier: string | null;
  departmentName: string | null;
  responsible: string | null;
  sponsor: string | null;
  status: string | null;
  percentComplete: number | null;
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
      return `MODO: BRAINSTORMING ESTRATÉGICO
Tu objetivo es generar ideas creativas y alternativas innovadoras.
- Proporciona mínimo 3 ideas concretas
- Cada idea debe incluir un "cómo" básico
- Prioriza ideas que amplifiquen el valor estratégico del proyecto`;
    case "DECIDE":
      return `MODO: ANÁLISIS DE DECISIÓN
Tu objetivo es ayudar a tomar una decisión estructurada.
- Presenta pros y contras claros
- Incluye análisis de trade-offs
- Cierra con una recomendación clara y justificada`;
    case "RISKS":
      return `MODO: IDENTIFICACIÓN DE RIESGOS
Tu objetivo es identificar y analizar riesgos potenciales.
- Categoriza: Técnicos, Operacionales, Financieros, Estratégicos
- Para cada riesgo, sugiere una mitigación concreta
- Prioriza por probabilidad e impacto`;
    case "NEXT_ACTIONS":
      return `MODO: PLANIFICACIÓN DE ACCIONES
Tu objetivo es definir los próximos pasos concretos.
- Lista acciones específicas y medibles
- Sugiere responsables lógicos basados en el contexto
- Establece secuencia y dependencias`;
  }
}

function formatFinancialImpact(impact: string | null): string {
  const mapping: Record<string, string> = {
    "HIGH_REVENUE": "Alto (>$300k USD) - Proyecto de alto impacto financiero",
    "MEDIUM_REVENUE": "Medio ($100k-$300k USD) - Impacto financiero moderado",
    "LOW_REVENUE": "Bajo (<$100k USD) - Impacto financiero menor",
    "NONE": "Sin beneficio financiero directo",
  };
  return mapping[impact || ""] || "No clasificado";
}

function formatStrategicFit(fit: string | null): string {
  const mapping: Record<string, string> = {
    "FULL": "Alineación TOTAL con estrategia corporativa",
    "PARTIAL": "Alineación PARCIAL con estrategia",
    "NONE": "Sin alineación estratégica clara",
  };
  return mapping[fit || ""] || "No clasificado";
}

function formatCapexTier(tier: string | null): string {
  const mapping: Record<string, string> = {
    "HIGH_COST": "Alto (>$100k USD inversión)",
    "MEDIUM_COST": "Medio ($20k-$100k USD)",
    "LOW_COST": "Bajo (<$20k USD)",
    "ZERO_COST": "Sin inversión requerida",
  };
  return mapping[tier || ""] || "No clasificado";
}

async function fetchProjectContext(projectId: number): Promise<ProjectContext | null> {
  const [project] = await db
    .select({
      id: projects.id,
      projectName: projects.projectName,
      description: projects.description,
      problemStatement: projects.problemStatement,
      objective: projects.objective,
      benefits: projects.benefits,
      financialImpact: projects.financialImpact,
      strategicFit: projects.strategicFit,
      capexTier: projects.capexTier,
      departmentName: projects.departmentName,
      responsible: projects.responsible,
      sponsor: projects.sponsor,
      status: projects.status,
      percentComplete: projects.percentComplete,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  return project || null;
}

function buildProjectPrompt(ctx: ProjectContext): { prompt: string; isFallback: boolean } {
  const descLength = (ctx.description || "").trim().length;
  const isFallback = descLength < 50;

  const lines: string[] = [];
  lines.push("# CONTEXTO DEL PROYECTO");
  lines.push("");
  lines.push(`## Identificación`);
  lines.push(`- **Nombre:** ${ctx.projectName || "Sin nombre"}`);
  lines.push(`- **ID:** ${ctx.id}`);
  lines.push(`- **Departamento:** ${ctx.departmentName || "No especificado"}`);
  lines.push(`- **Responsable:** ${ctx.responsible || "No asignado"}`);
  lines.push(`- **Sponsor:** ${ctx.sponsor || "No asignado"}`);
  lines.push(`- **Estado:** ${ctx.status || "No definido"}`);
  lines.push(`- **% Completado:** ${ctx.percentComplete ?? "No reportado"}%`);
  lines.push("");

  lines.push("## Clasificación Estratégica");
  lines.push(`- **Impacto Financiero:** ${formatFinancialImpact(ctx.financialImpact)}`);
  lines.push(`- **Alineación Estratégica:** ${formatStrategicFit(ctx.strategicFit)}`);
  lines.push(`- **Nivel de Inversión:** ${formatCapexTier(ctx.capexTier)}`);
  lines.push("");

  if (isFallback) {
    lines.push("## Descripcion");
    lines.push("La descripcion es breve o esta vacia.");
    const descText = ctx.description || "(vacio)";
    lines.push("Texto disponible: " + descText);
    lines.push("");
    lines.push("INSTRUCCION ESPECIAL: Dado que la descripcion es breve, usa el TITULO del proyecto como base para inferir el proposito y generar ideas. Se creativo pero realista.");
  } else {
    lines.push("## Descripción del Proyecto");
    lines.push(ctx.description || "");
    lines.push("");
  }

  // Add problem statement if different from description
  if (ctx.problemStatement && ctx.problemStatement.trim().length > 10 && ctx.problemStatement !== ctx.description) {
    lines.push("## Problema u Oportunidad");
    lines.push(ctx.problemStatement);
    lines.push("");
  }

  // Add objective
  if (ctx.objective && ctx.objective.trim().length > 10) {
    lines.push("## Objetivo / Intención");
    lines.push(ctx.objective);
    lines.push("");
  }

  // Add benefits
  if (ctx.benefits && ctx.benefits.trim().length > 10) {
    lines.push("## Beneficios Esperados");
    lines.push(ctx.benefits);
    lines.push("");
  }

  return { prompt: lines.join("\n"), isFallback };
}

export async function runOrchestrator(req: OrchestratorRequest): Promise<OrchestratorResponse> {
  let projectContext: ProjectContext | null = null;
  let projectPrompt = "";
  let isFallback = false;
  
  // Fetch project context if ID provided
  if (req.projectId) {
    projectContext = await fetchProjectContext(req.projectId);
    if (projectContext) {
      const result = buildProjectPrompt(projectContext);
      projectPrompt = result.prompt;
      isFallback = result.isFallback;
    }
  }
  
  const hasContext = projectContext !== null;
  const modeInstruction = getModePrompt(req.mode);
  
  const systemPromptLines = [
    "Eres un Socio de Innovacion Estrategica (Strategic Innovation Partner) para la PMO.",
    "Tu mision es ayudar a los lideres de proyecto a pensar mas alla de lo obvio.",
    "",
    "REGLAS FUNDAMENTALES:",
    "1. USA LOS DATOS - Basa tus respuestas en la informacion proporcionada del proyecto.",
    "2. INTERPRETA LAS ETIQUETAS:",
    "   - Si financial_impact = HIGH_REVENUE, el proyecto tiene ambicion financiera alta. Tus ideas deben estar a la altura.",
    "   - Si strategic_fit = FULL, alinea tus sugerencias con la estrategia corporativa.",
    "   - Si capex_tier = ZERO_COST, enfocate en soluciones de bajo costo y alto impacto.",
    "3. FALLBACK CREATIVO: Si la descripcion es corta, NO digas 'no puedo ayudar'. Di: 'La descripcion es breve, pero basandome en el titulo, aqui hay 3 angulos potenciales...'",
    "4. IDIOMA: Responde SIEMPRE en espanol.",
    "5. FORMATO: Responde en JSON valido.",
    "",
    modeInstruction,
    "",
    "FORMATO DE RESPUESTA (JSON):",
    "{",
    '  "summary": "Resumen ejecutivo conciso (2-3 oraciones)",',
    '  "ideas": ["Idea 1 con breve como", "Idea 2", "Idea 3"],',
    '  "risks": ["Riesgo identificado con mitigacion sugerida"],',
    '  "nextActions": ["Accion concreta 1", "Accion 2"],',
    '  "questionsToClairfy": ["Pregunta para profundizar"],',
    '  "insufficientEvidence": false,',
    '  "missingFields": ["Campos que faltan para un mejor analisis"]',
    "}",
  ];
  const systemPrompt = systemPromptLines.join("\n");

  let userPrompt: string;
  if (hasContext) {
    userPrompt = projectPrompt + "\n\n---\n\n## CONSULTA DEL USUARIO:\n" + req.message;
  } else {
    userPrompt = "## MODO: IDEACION GENERAL (Sin proyecto especifico)\n\nEl usuario busca orientacion general sin un proyecto especifico.\n\n## CONSULTA:\n" + req.message;
  }

  if (!openai) {
    return {
      summary: "Orquestador no disponible - OpenAI no configurado",
      ideas: [],
      risks: [],
      nextActions: [],
      questionsToClairfy: ["¿Puedes contactar al administrador para configurar la integración de IA?"],
      projectContext: null,
      insufficientEvidence: true,
      fallbackMode: false,
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
      max_tokens: 2048,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return {
      summary: parsed.summary || "",
      ideas: parsed.ideas || [],
      risks: parsed.risks || [],
      nextActions: parsed.nextActions || [],
      questionsToClairfy: parsed.questionsToClairfy || [],
      projectContext: projectContext ? {
        name: projectContext.projectName,
        description: projectContext.description,
        financialAmbition: projectContext.financialImpact,
        strategicAlignment: projectContext.strategicFit,
        investmentLevel: projectContext.capexTier,
      } : null,
      insufficientEvidence: parsed.insufficientEvidence || false,
      fallbackMode: isFallback,
      missingFields: parsed.missingFields || [],
    };
  } catch (error) {
    console.error("Orchestrator error:", error);
    return {
      summary: "Error al procesar la solicitud del orquestador",
      ideas: [],
      risks: [],
      nextActions: [],
      questionsToClairfy: [],
      projectContext: null,
      insufficientEvidence: true,
      fallbackMode: false,
      missingFields: ["Error de procesamiento - revisar logs"],
    };
  }
}

/**
 * Search projects by name or description for brainstorming context
 */
export async function searchProjectsForBrainstorm(query: string): Promise<Array<{
  id: number;
  name: string;
  financialImpact: string | null;
  strategicFit: string | null;
}>> {
  const allProjects = await db
    .select({
      id: projects.id,
      projectName: projects.projectName,
      description: projects.description,
      financialImpact: projects.financialImpact,
      strategicFit: projects.strategicFit,
    })
    .from(projects)
    .where(eq(projects.isActive, true));

  const queryLower = query.toLowerCase();
  
  return allProjects
    .filter(p => 
      (p.projectName?.toLowerCase().includes(queryLower)) ||
      (p.description?.toLowerCase().includes(queryLower))
    )
    .slice(0, 10)
    .map(p => ({
      id: p.id,
      name: p.projectName || "Sin nombre",
      financialImpact: p.financialImpact,
      strategicFit: p.strategicFit,
    }));
}
