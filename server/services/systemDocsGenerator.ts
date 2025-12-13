import { storage } from "../storage";

interface SystemDocGenerationResult {
  docsCreated: number;
  docTypes: string[];
}

export async function generateSystemDocs(): Promise<SystemDocGenerationResult> {
  const docTypes = ["ARCHITECTURE", "OPS_MANUAL", "AGENT_REGISTRY", "DATA_LINEAGE"];
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
