# PMO Continuous Improvement Dashboard

## Overview
A Project Management Office (PMO) dashboard for managing continuous improvement projects. The platform provides a centralized view of project status, performance, and key metrics. It features deterministic Excel data parsing, PostgreSQL persistence, role-based authentication, and a fact-based conversational AI assistant. The system aims to enhance project oversight, facilitate data-driven decision-making, and streamline continuous improvement initiatives within an organization.

## Recent Changes (Dec 2025)
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