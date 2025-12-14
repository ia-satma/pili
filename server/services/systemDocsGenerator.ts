import { storage } from "../storage";

interface SystemDocGenerationResult {
  docsCreated: number;
  docTypes: string[];
}

export async function generateSystemDocs(): Promise<SystemDocGenerationResult> {
  const docTypes = ["ARCHITECTURE", "OPS_MANUAL", "AGENT_REGISTRY", "DATA_LINEAGE", "API_REFERENCE", "EVAL_SUMMARY"];
  const docsCreated: string[] = [];

  for (const docType of docTypes) {
    const content = await generateDocContent(docType);
    await storage.createSystemDoc({
      docType,
      contentMarkdown: content,
    });
    docsCreated.push(docType);
  }

  return {
    docsCreated: docsCreated.length,
    docTypes: docsCreated,
  };
}

async function generateDocContent(docType: string): Promise<string> {
  const timestamp = new Date().toISOString();

  switch (docType) {
    case "ARCHITECTURE":
      return generateArchitectureDoc(timestamp);
    case "OPS_MANUAL":
      return generateOpsManualDoc(timestamp);
    case "AGENT_REGISTRY":
      return await generateAgentRegistryDoc(timestamp);
    case "DATA_LINEAGE":
      return await generateDataLineageDoc(timestamp);
    case "API_REFERENCE":
      return generateApiReferenceDoc(timestamp);
    case "EVAL_SUMMARY":
      return await generateEvalSummaryDoc(timestamp);
    default:
      return `# ${docType}\n\nGenerado: ${timestamp}\n`;
  }
}

function generateArchitectureDoc(timestamp: string): string {
  return `# Arquitectura del Sistema PMO

Generado automáticamente: ${timestamp}

## Visión General

PILAR es un sistema de gestión de PMO (Project Management Office) que proporciona:
- Dashboard de KPIs y estado de proyectos
- Sistema de semáforos basado en fechas
- Parsing determinístico de Excel
- Asistente conversacional con zero-hallucination
- Framework de agentes para automatización

## Capas del Sistema

### Frontend (React + TypeScript)
- UI con shadcn/ui + Tailwind CSS
- Routing con wouter
- Estado con TanStack Query
- Gráficas con Recharts

### Backend (Express.js + TypeScript)
- API REST
- Autenticación passport-local + bcrypt
- Worker loop para jobs asíncronos

### Base de Datos (PostgreSQL + Drizzle ORM)
- Proyectos y versiones Excel
- Iniciativas con snapshots inmutables
- Deltas y alertas de gobernanza
- Jobs, agent runs, council reviews

### Servicios de Dominio
- **Delta Engine**: Detecta cambios entre snapshots
- **Signal Detector**: Genera alertas de gobernanza (ZOMBI, ANGUILA, etc.)
- **Export Engine**: Genera Excel oficiales
- **Committee Packet Generator**: Resúmenes para comités
- **Agent Runner**: Ejecuta agentes con evidencia de BD
- **Evidence Pack**: RAG-lite con datos de BD

## Flujo de Datos

1. Excel → Ingestion → Raw Artifacts + Validation Issues
2. Parsing → Identity Resolution → Initiatives + Snapshots
3. Snapshots → Delta Engine → Delta Events
4. Deltas → Signal Detector → Governance Alerts
5. User Request → Agent Runner → Evidence Pack → LLM → Council Review → Output

## Evidence Pack Limits

El Evidence Pack utiliza límites para optimizar el contexto enviado al LLM:

| Parámetro | Límite | Descripción |
|-----------|--------|-------------|
| maxSnapshots | 3 | Snapshots más recientes incluidos |
| maxDeltas | 50 | Eventos delta máximos |
| maxStatusUpdates | 5 | Actualizaciones de estado recientes |
| maxAlerts | 20 | Alertas de gobernanza activas |

Estos límites aseguran que el contexto no exceda los límites del modelo y mantenga relevancia temporal.
`;
}

function generateOpsManualDoc(timestamp: string): string {
  return `# Manual de Operaciones

Generado automáticamente: ${timestamp}

## Arranque del Sistema

El sistema se inicia con \`npm run dev\` que ejecuta:
- Servidor Express en puerto 5000
- Worker loop para procesamiento de jobs
- Vite dev server para frontend

## Jobs del Sistema

| Tipo de Job | Descripción | Trigger |
|-------------|-------------|---------|
| GENERATE_EXPORT_EXCEL | Genera Excel oficial | POST /api/exports/run |
| GENERATE_COMMITTEE_PACKET | Resumen para comité | POST /api/committee/run |
| DETECT_LIMBO | Detecta iniciativas estancadas | Automático (24h) |
| DRAFT_CHASERS | Genera emails de seguimiento | Manual |
| GENERATE_SYSTEM_DOCS | Actualiza documentación | POST /api/system/docs/run |
| RUN_EVALS_DAILY | Ejecuta evaluaciones de calidad | Automático (24h) |

## Monitoreo

### Logs
- \`[Worker]\`: Procesamiento de jobs
- \`[Agents]\`: Ejecución de agentes
- \`[Delta]\`: Cambios detectados
- \`[Signal]\`: Alertas generadas

### Alertas de Gobernanza
- **ZOMBI**: Sin actualizaciones en 21+ días
- **ANGUILA**: Fecha fin se mueve >15 días en 3 snapshots
- **OPTIMISTA**: Score sube >20% sin nuevas evaluaciones
- **INDECISO**: Campo cambia A→B→A en 4 semanas
- **DRENAJE_DE_VALOR**: Valor total decrece

## Usuarios y Roles

| Rol | Permisos |
|-----|----------|
| admin | Todo + gestión de usuarios |
| editor | CRUD proyectos + ejecutar agentes |
| viewer | Solo lectura |

## Troubleshooting

### Job estancado
Los jobs con lock >10 minutos se reencolan automáticamente.

### Error de OpenAI
Verificar que AI_INTEGRATIONS_OPENAI_API_KEY esté configurada.

### Error de agente
Council reviews BLOCKED si faltan ANTHROPIC_API_KEY o GOOGLE_API_KEY.
`;
}

async function generateAgentRegistryDoc(timestamp: string): Promise<string> {
  const agents = await storage.getAgentDefinitions();
  
  let content = `# Registro de Agentes

Generado automáticamente: ${timestamp}

## Agentes Disponibles

`;

  for (const agent of agents) {
    const activeVersion = await storage.getActiveAgentVersion(agent.name);
    content += `### ${agent.name}

- **Propósito**: ${agent.purpose || "N/A"}
- **Habilitado**: ${agent.enabled ? "Sí" : "No"}
- **Versión Activa**: ${activeVersion?.version || "N/A"}
- **Modelo**: ${activeVersion?.modelProvider || "N/A"} / ${activeVersion?.modelName || "N/A"}

`;
  }

  content += `## Council de Revisión

Cada ejecución de agente pasa por 3 revisores:

| Revisor | Rol | API Requerida |
|---------|-----|---------------|
| CHAIRMAN | Generador principal (auto-aprueba) | OpenAI |
| CRITIC | Revisión de calidad | Anthropic |
| QUANT | Validación numérica | Google |

## Ejecutar un Agente

\`\`\`bash
POST /api/agents/:name/run
Body: { "initiativeId": 123 }
\`\`\`

Respuesta incluye:
- runId: ID de la ejecución
- status: SUCCEEDED, BLOCKED, FAILED
- outputJson: Resultado del agente
- reviews: Array de council reviews
`;

  return content;
}

async function generateDataLineageDoc(timestamp: string): Promise<string> {
  const batches = await storage.getIngestionBatches();
  const initiatives = await storage.getInitiatives();
  
  return `# Linaje de Datos

Generado automáticamente: ${timestamp}

## Estadísticas Actuales

- **Batches de ingesta**: ${batches.length}
- **Iniciativas canónicas**: ${initiatives.length}

## Flujo de Datos

\`\`\`
Excel Upload
    ↓
[ingestion_batches] → hash SHA-256 para idempotencia
    ↓
[raw_artifacts] → archivo original en BYTEA
    ↓
[validation_issues] → errores hard/soft
    ↓
Identity Resolution (devopsCardId > powerSteeringId > title+owner)
    ↓
[initiatives] → entidad canónica
    ↓
[initiative_snapshots] → punto en tiempo inmutable
    ↓
[delta_events] → cambios entre snapshots
    ↓
[governance_alerts] → señales de riesgo
\`\`\`

## Trazabilidad

Cada snapshot tiene:
- \`batch_id\`: Batch de origen
- \`raw_excel_row\`: Fila original JSON
- \`created_at\`: Timestamp de creación

Cada delta tiene:
- \`from_snapshot_id\`: Snapshot anterior
- \`to_snapshot_id\`: Snapshot nuevo
- \`field_path\`: Campo modificado

## Evidence Pack

Los agentes reciben un pack de evidencia con:
- Initiative (datos canónicos)
- Latest Snapshot (estado actual)
- Recent Snapshots (últimos 3)
- Recent Deltas (últimos 20)
- Open Alerts (alertas activas)
- Recent Status Updates (últimas 5)
- Provenance (IDs de trazabilidad)
`;
}

function generateApiReferenceDoc(timestamp: string): string {
  return `# API Reference

Generado automáticamente: ${timestamp}

## RBAC Protections

El sistema implementa Role-Based Access Control (RBAC) con tres niveles de acceso:

| Rol | Descripción |
|-----|-------------|
| admin | Acceso completo + gestión de usuarios |
| editor | CRUD de proyectos + ejecución de agentes |
| viewer | Solo lectura de datos |

### Endpoints Protegidos por Rol

| Endpoint Pattern | Rol Mínimo | Descripción |
|------------------|------------|-------------|
| \`/api/system/*\` | admin | Configuración del sistema y documentación |
| \`/api/agents/*\` | editor | Ejecución y gestión de agentes |
| \`/api/exports/download\` | viewer | Descarga de exports generados |
| \`/api/ingest/artifacts/download\` | viewer | Descarga de artifacts de ingesta |
| \`/api/jobs/*\` | editor | Gestión y monitoreo de jobs |
| \`/api/admin/users/*\` | admin | Gestión de usuarios |
| \`/api/orchestrator/*\` | editor | PMO Bot / Orchestrator |

## Rate Limits

Límites de tasa aplicados para proteger el sistema:

| Endpoint | Límite | Ventana | Descripción |
|----------|--------|---------|-------------|
| Agent runs (\`/api/agents/*/run\`) | 5 | 1 minuto | Ejecución de agentes |
| System docs (\`/api/system/docs/run\`) | 3 | 1 minuto | Generación de documentación |
| Exports (\`/api/exports/run\`) | 10 | 1 minuto | Generación de Excel |
| Uploads (\`/api/ingest/upload\`) | 5 | 1 minuto | Carga de archivos Excel |

### Límites de Archivo

| Parámetro | Límite |
|-----------|--------|
| Tamaño máximo Excel | 15 MB |
| Formatos soportados | .xlsx, .xls |

## PMO Bot / Orchestrator

El Orchestrator proporciona un endpoint para interacción estructurada con el PMO Bot.

### POST /api/orchestrator/bounce

Envía una consulta al PMO Bot y recibe una respuesta estructurada.

**Request Body:**
\`\`\`json
{
  "mode": "BRAINSTORM" | "DECIDE" | "RISKS" | "NEXT_ACTIONS",
  "prompt": "Texto de la consulta del usuario",
  "context": {
    "initiativeId": 123,  // opcional
    "projectId": 456      // opcional
  }
}
\`\`\`

**Modos Soportados:**

| Modo | Propósito |
|------|-----------|
| BRAINSTORM | Generación de ideas y exploración de opciones |
| DECIDE | Análisis para toma de decisiones |
| RISKS | Identificación y evaluación de riesgos |
| NEXT_ACTIONS | Planificación de próximos pasos |

**Response:**
\`\`\`json
{
  "success": true,
  "mode": "BRAINSTORM",
  "response": {
    "content": "Respuesta estructurada del bot",
    "suggestions": ["sugerencia 1", "sugerencia 2"],
    "sources": ["initiative:123", "snapshot:456"]
  },
  "tokensUsed": 1500
}
\`\`\`

## Evals

El sistema de evaluaciones permite medir la calidad de las respuestas de los agentes.

### Tabla eval_runs

Almacena ejecuciones de evaluación con métricas de calidad:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | serial | ID único de la evaluación |
| agent_name | text | Nombre del agente evaluado |
| fixture_id | text | ID del fixture de prueba |
| score | numeric | Puntuación 0.0 - 1.0 |
| passed | boolean | Si superó el umbral |
| output_json | jsonb | Salida del agente |
| expected_json | jsonb | Salida esperada |
| created_at | timestamp | Fecha de ejecución |

### GET /api/evals/recent

Obtiene las evaluaciones más recientes.

**Query Parameters:**
- \`limit\`: Número de evaluaciones (default: 20)
- \`agent\`: Filtrar por nombre de agente

**Response:**
\`\`\`json
{
  "evals": [
    {
      "id": 1,
      "agentName": "RISK_ANALYST",
      "fixtureId": "happy_path_1",
      "score": 0.95,
      "passed": true,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
\`\`\`

### POST /api/evals/run

Ejecuta una evaluación contra fixtures predefinidos.

**Request Body:**
\`\`\`json
{
  "agentName": "RISK_ANALYST",
  "fixtureIds": ["happy_path_1", "edge_case_1"]  // opcional, ejecuta todos si omitido
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "results": [
    {
      "fixtureId": "happy_path_1",
      "score": 0.95,
      "passed": true
    }
  ],
  "summary": {
    "total": 2,
    "passed": 2,
    "avgScore": 0.93
  }
}
\`\`\`
`;
}

async function generateEvalSummaryDoc(timestamp: string): Promise<string> {
  const recentEvals = await storage.getRecentEvalRuns(100);
  
  const passedCount = recentEvals.filter(e => e.status === "PASS").length;
  const failedCount = recentEvals.filter(e => e.status === "FAIL").length;
  const errorCount = recentEvals.filter(e => e.status === "ERROR").length;
  const totalCount = recentEvals.length;
  
  const passRate = totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(1) : "N/A";
  
  const lastRunDate = recentEvals.length > 0 && recentEvals[0].startedAt 
    ? new Date(recentEvals[0].startedAt).toISOString()
    : "Never";
  
  const byFixture: Record<string, { passed: number; failed: number; error: number }> = {};
  for (const evalRun of recentEvals) {
    const fixture = evalRun.fixtureName;
    if (!byFixture[fixture]) {
      byFixture[fixture] = { passed: 0, failed: 0, error: 0 };
    }
    if (evalRun.status === "PASS") byFixture[fixture].passed++;
    else if (evalRun.status === "FAIL") byFixture[fixture].failed++;
    else if (evalRun.status === "ERROR") byFixture[fixture].error++;
  }
  
  let fixtureTable = `| Fixture | Passed | Failed | Error |
|---------|--------|--------|-------|
`;
  for (const [fixture, counts] of Object.entries(byFixture)) {
    fixtureTable += `| ${fixture} | ${counts.passed} | ${counts.failed} | ${counts.error} |\n`;
  }

  return `# Eval Summary

Generado automáticamente: ${timestamp}

## Resumen de Evaluaciones

| Métrica | Valor |
|---------|-------|
| Total de ejecuciones | ${totalCount} |
| Pasadas | ${passedCount} |
| Falladas | ${failedCount} |
| Errores | ${errorCount} |
| Tasa de éxito | ${passRate}% |
| Última ejecución | ${lastRunDate} |

## Estado de Regresión

${totalCount > 0 && (failedCount + errorCount) / totalCount > 0.20 
  ? "**ALERTA**: Regresión detectada. Más del 20% de las evaluaciones recientes han fallado."
  : "Estado: Normal. La tasa de fallos está dentro del umbral aceptable (< 20%)."}

## Resultados por Fixture

${fixtureTable}

## Quality Gates

El sistema ejecuta evaluaciones diarias (RUN_EVALS_DAILY) para monitorear la calidad:

- **Umbral de regresión**: 20% de fallos
- **Severidad de alerta**: HIGH
- **Código de señal**: EVAL_REGRESSION
- **Frecuencia**: Cada 24 horas

## Acciones Recomendadas

${(failedCount + errorCount) > 0 ? `
- Revisar los fixtures fallidos en la tabla anterior
- Verificar logs de los agentes involucrados
- Confirmar que las APIs externas (OpenAI, Anthropic, Google) estén funcionando
- Ejecutar evaluaciones manuales para fixtures específicos
` : `
- Sin acciones requeridas. Todas las evaluaciones están pasando.
`}
`;
}
