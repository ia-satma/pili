# PMO Continuous Improvement Dashboard

## Overview
A Project Management Office (PMO) dashboard for managing continuous improvement projects. The platform provides a centralized view of project status, performance, and key metrics. It features deterministic Excel data parsing, PostgreSQL persistence, role-based authentication, and a fact-based conversational AI assistant. The system aims to enhance project oversight, facilitate data-driven decision-making, and streamline continuous improvement initiatives within an organization.

## Recent Changes (Dec 2025)
- **Phase H4 DB-Backed Autonomy & Excel Export Completed**: Job queue system and official exports
  - Job Queue System (DB-backed, no cron): jobs table with status/locking/retry, job_runs for history
  - Worker Loop (server/services/workerLoop.ts): Polls QUEUED jobs, SELECT FOR UPDATE locking, stale lock detection (10 min TTL)
  - Job Types: GENERATE_EXPORT_EXCEL, GENERATE_COMMITTEE_PACKET, DETECT_LIMBO, DRAFT_CHASERS
  - Export Engine (server/services/exportEngine.ts): Latest snapshots → Excel BYTEA with content_sha256
  - Committee Packet Generator (server/services/committeePacketGenerator.ts): JSON summary with recommended actions
  - Chaser Drafts (server/services/chaserDraftGenerator.ts): Draft emails for HIGH/ZOMBI alerts
  - API endpoints: POST /api/exports/run, GET /api/exports, GET /api/exports/:id/download, POST /api/committee/run, GET /api/committee/packets, GET /api/chasers, GET /api/jobs/:id
  - UI: /exports, /committee, /committee/:id, /chasers pages with Spanish text
  - New tables: committee_packets, chaser_drafts (jobs/job_runs redesigned for queue-based)

- **Phase H3 Delta Engine & Signal Detection Completed**: Change tracking and governance alerts
  - Added H3 schema tables: delta_events, governance_alerts with proper indexes
  - Delta Engine (server/services/deltaEngine.ts): Compares consecutive snapshots, generates deltas
  - Signal Detector (server/services/signalDetector.ts): 5 governance signals:
    - ZOMBI: No status updates in 21+ days
    - ANGUILA: End date shifted >15 days in 3 consecutive snapshots
    - OPTIMISTA: Score increased >20% without new assessments
    - INDECISO: Field changed A→B→A within 4 weeks
    - DRENAJE_DE_VALOR: Total value decreased between consecutive snapshots
  - API endpoints: GET /api/initiatives/:id/deltas, GET /api/alerts, GET /api/initiatives/:id/alerts
  - UI: /alerts page with governance alerts list, initiative detail page shows deltas and alerts

- **Phase H2 Initiative Snapshots Completed**: Identity resolution and immutable snapshot history
  - Added H2 schema tables: initiatives, scoringModels, scoringCriteria, scoringOptions, initiativeSnapshots, assessmentEntries, benefitRecords, statusUpdates, actionItems
  - Implemented Identity Resolution: devopsCardId > powerSteeringId > (title+owner) canonical matching
  - Snapshot Engine creates immutable point-in-time snapshots (never overwritten)
  - Unique constraint on [initiativeId, batchId] ensures exactly 1 snapshot per initiative per batch
  - TOTAL_MISMATCH detection creates SOFT validation warnings when Excel totals differ from calculated
  - Time-travel UI: /initiatives list page, /initiatives/:id detail with snapshot history
  - API endpoints: GET /api/initiatives, GET /api/initiatives/:id, GET /api/initiatives/:id/snapshots

- **Phase H1 Data Foundation Completed**: Added infrastructure for data ingestion and export
  - Added H1 schema tables: ingestion_batches, raw_artifacts, validation_issues, template_versions, export_batches, export_artifacts, jobs, job_runs
  - Implemented BYTEA custom type for storing binary files in PostgreSQL
  - Created ingestion endpoints: POST /api/ingest/upload, GET /api/ingest/batches, GET /api/ingest/batches/:id/issues, GET /api/ingest/artifacts/:id/download
  - Added idempotency check using SHA-256 hash - duplicate files return NOOP
  - All validation issues persisted to validation_issues table
  - Created IngestionStatus UI component for monitoring upload batches

- **Phase H0 Hardening Completed**: Fixed type safety issues across critical paths
  - Removed `any` type bypasses in auth, OpenAI, and upload handlers
  - Added structured error logging with proper type narrowing
  - Fixed silent error swallowing in Excel upload component
  - Applied workaround for drizzle-zod omit() TypeScript bug (see GitHub issue #4016)

## User Preferences
- Language: Spanish (ES-MX)
- Zero hallucination requirement for all data
- Complete audit trail for all changes
- Fluent Design System adapted for data-heavy applications

## System Architecture

### Tech Stack
-   **Frontend**: React + TypeScript with Vite
-   **Backend**: Express.js + TypeScript
-   **Database**: PostgreSQL (Neon) with Drizzle ORM
-   **Authentication**: Email/Password with `passport-local` + `bcrypt`
-   **UI Components**: `shadcn/ui` + Tailwind CSS
-   **Charts**: Recharts
-   **AI**: OpenAI GPT-5 via Replit AI Integrations

### Key Features
-   **Dashboard**: KPI cards, traffic light summary, charts, and automated alerts for project status.
-   **Projects Grid**: Excel-like data grid with inline editing, multi-select, bulk updates, and advanced filtering with saved presets.
-   **Traffic Light System**: Date-based visual indicators (Green/Yellow/Red/Gray) based on `ESTATUS AL DÍA` column.
-   **Excel Integration**: Deterministic parsing with row-level error handling for uploads, and export functionality.
-   **Version Control**: Complete audit trail and change tracking for all project modifications.
-   **PMO Chatbot**: A zero-hallucination AI assistant providing insights solely from database facts.
-   **Role-based Authentication**: Admin, Editor, and Viewer roles with granular permission enforcement.
-   **PMO Scoring System**: Prioritization matrix (Value/Effort) for projects, including `Total Valor`, `Total Esfuerzo`, `Puntaje Total`, and `Ranking` calculations, with quadrant visualization (Quick Wins, Big Bets, Fill-Ins, Money Pit).
-   **Semantic Field Organization**: Project data fields are organized into categories like Identification, Governance, Classification, Dates, Status, Scoring, Impact, and Dependencies, with contextual tooltips.

### Core Architectural Decisions
-   **Deterministic Excel Parsing**: Strict two-sheet parser ("Proyectos PGP" and "Indicadores") with robust error handling, ensuring data integrity.
-   **Role-Based Access Control**: Implemented at the API level with middleware to secure endpoints and manage user permissions.
-   **Database Schema**: Designed for project management, user authentication, change logging, KPI tracking, and chat history.
-   **UI/UX**: Utilizes `shadcn/ui` and Tailwind CSS for a consistent, data-heavy Fluent Design experience.
-   **AI Integration**: OpenAI GPT-5 is integrated for the PMO Chatbot, strictly adhering to a zero-hallucination policy by citing only verified database data.

## External Dependencies
-   **PostgreSQL (Neon)**: Cloud-hosted relational database for data persistence.
-   **OpenAI GPT-5**: AI model used for the PMO Chatbot functionality.
-   **Replit AI Integrations**: Platform for integrating AI services.
-   **Replit Auth**: OpenID Connect authentication for user management.

## Phase H1 DoD Verification Checklist

### Prerequisites
- Admin or Editor user account logged in
- Access to /upload page

### DoD Test 1: Idempotency Check (h1-7)
**Method**: Use browser DevTools Network tab while logged in as Editor/Admin

1. Navigate to /upload page (logged in as Editor or Admin)
2. Open browser DevTools → Network tab
3. Use POST /api/ingest/upload with any Excel file (via curl or test script)
4. Note the `batchId` from the JSON response
5. Upload the SAME exact file again
6. **Expected**: Response contains `"noop": true` and same `batchId`
7. **Database Verification**:
   ```sql
   SELECT id, source_file_hash, status, created_at FROM ingestion_batches 
   ORDER BY created_at DESC LIMIT 5;
   -- Should show only ONE entry per unique file hash
   ```

### DoD Test 2: Validation Issues Visible (h1-8)
**Method**: Visual inspection of /upload page

1. Navigate to /upload page after uploading a file
2. **Verify** IngestionStatus card shows:
   - Title: "Estado de Ingesta"
   - Source file name in description
   - Total rows count (data-testid="text-total-rows")
   - Processed rows count (data-testid="text-processed-rows")
   - Hard error count (data-testid="text-hard-errors")
   - Soft error count (data-testid="text-soft-errors")
3. **If validation issues exist**, verify "Problemas de Validación" card appears with issue table

### DoD Test 3: Artifact Download (h1-9)
**Method**: Browser download and header inspection

1. Navigate to /upload page after uploading a file
2. Click "Descargar Archivo Original" button (data-testid="button-download-artifact")
3. **Verify in DevTools Network tab**:
   - Response status: 200
   - Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   - Content-Disposition: `attachment; filename="<original_filename>.xlsx"`
4. **Expected**: Downloaded file opens correctly in Excel/LibreOffice

### API Endpoints for Manual Testing
```bash
# Get all batches (requires auth session cookie)
GET /api/ingest/batches

# Get issues for a batch
GET /api/ingest/batches/:id/issues

# Download original artifact
GET /api/ingest/artifacts/:id/download
```

### Test Script Example (requires authenticated session)
```bash
# First login to get session cookie, then:
curl -X POST http://localhost:5000/api/ingest/upload \
  -F "file=@path/to/test.xlsx" \
  -b "connect.sid=<session_cookie>"
```

## Database Restore Test Procedure

### Prerequisites
- Access to Replit database pane or Neon console
- Admin credentials for the application

### Test Steps

1. **Verify H1 Tables Exist**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('ingestion_batches', 'raw_artifacts', 'validation_issues', 
                      'template_versions', 'export_batches', 'export_artifacts', 
                      'jobs', 'job_runs');
   ```

2. **Test Ingestion Upload**
   - Upload an Excel file via POST /api/ingest/upload
   - Verify batch created in ingestion_batches table
   - Verify raw artifact stored in raw_artifacts table
   - Check validation_issues for any parsing errors

3. **Test Idempotency**
   - Upload the same file again
   - Response should return `noop: true` with existing batch ID
   - No duplicate records should be created

4. **Test Artifact Download**
   - GET /api/ingest/artifacts/{id}/download
   - Verify Content-Type matches original file MIME type
   - Verify Content-Disposition header contains original filename
   - Compare file hash to ensure binary integrity

5. **Verify Foreign Key Constraints**
   ```sql
   -- Verify constraints exist
   SELECT conname, conrelid::regclass, confrelid::regclass 
   FROM pg_constraint 
   WHERE contype = 'f' 
   AND conrelid::regclass::text IN ('raw_artifacts', 'validation_issues', 
                                     'export_artifacts', 'job_runs');
   ```

### Recovery Steps

If tables are missing after restore:
```bash
npm run db:push
```

This will recreate all tables defined in shared/schema.ts without data loss for existing tables.