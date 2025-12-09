# PMO Continuous Improvement Dashboard

## Overview
A Project Management Office (PMO) dashboard for managing continuous improvement projects. The platform features deterministic Excel data parsing, PostgreSQL persistence, role-based authentication with Replit Auth, and a fact-based conversational assistant that only responds with verified database data.

## Project Architecture

### Tech Stack
- **Frontend**: React + TypeScript with Vite
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect)
- **UI Components**: shadcn/ui + Tailwind CSS
- **Charts**: Recharts
- **AI**: OpenAI GPT-5 via Replit AI Integrations

### Key Features
1. **Dashboard** - KPI cards showing project counts, traffic light summary, charts
2. **Dashboard Alerts** - Automated notifications for overdue, approaching deadline, and stale projects
3. **Projects Grid** - Excel-like data grid with inline editing, multi-select, bulk updates
4. **Traffic Light System** - Date-based visual indicators (Green/Yellow/Red/Gray)
5. **Excel Upload** - Deterministic parsing with row-level soft/hard error handling
6. **Excel Export** - Export filtered projects to Excel format
7. **Advanced Filtering** - Filter by status/department with saved presets
8. **Version Control** - Complete audit trail and change tracking
9. **PMO Chatbot** - Zero-hallucination AI assistant that only cites database facts
10. **Role-based Auth** - Admin, Editor, Viewer roles with permission enforcement

### User Roles
- **Admin**: Full access - upload Excel, edit projects, manage users, bulk delete
- **Editor**: Can edit projects, bulk update status/priority, upload Excel
- **Viewer**: Read-only access - can view dashboard, projects, history, chat

### File Structure
```
├── client/src/
│   ├── components/          # Reusable UI components
│   │   ├── app-sidebar.tsx  # Navigation sidebar with user profile
│   │   ├── kpi-card.tsx     # KPI display cards
│   │   ├── traffic-light.tsx # Status indicators
│   │   ├── projects-grid.tsx # Data grid with bulk operations
│   │   ├── excel-upload.tsx  # File upload component
│   │   ├── pmo-chat.tsx      # Chatbot interface
│   │   └── version-comparison.tsx # Change tracking
│   ├── pages/               # Route pages
│   │   ├── dashboard.tsx
│   │   ├── projects.tsx
│   │   ├── indicators.tsx
│   │   ├── history.tsx
│   │   ├── upload.tsx
│   │   ├── chat.tsx
│   │   └── admin-users.tsx  # User management (admin only)
│   ├── hooks/
│   │   ├── useAuth.ts       # Authentication hook
│   │   └── use-document-title.ts # SEO page titles
│   └── lib/
│       └── authUtils.ts     # Auth error handling
├── server/
│   ├── db.ts               # Database connection
│   ├── storage.ts          # Database storage layer
│   ├── routes.ts           # API endpoints with role guards
│   ├── replitAuth.ts       # OpenID Connect authentication
│   ├── excel-parser.ts     # Deterministic Excel parsing
│   └── openai.ts           # AI integration for PMO Bot
└── shared/
    └── schema.ts           # Database schema (Drizzle)
```

### Database Schema
- `users` - User accounts with roles (admin/editor/viewer)
- `sessions` - Session storage for authentication
- `excel_versions` - Uploaded Excel file versions
- `projects` - Main project records with draft flags
- `project_updates` - S/N parsed status updates
- `change_logs` - Complete audit trail
- `kpi_values` - Calculated KPIs per version
- `chat_messages` - PMO Bot conversation history
- `filter_presets` - Saved filter configurations

### API Endpoints

#### Public (No Auth)
- `GET /api/dashboard` - Dashboard statistics
- `GET /api/projects` - All active projects
- `GET /api/projects/:id` - Project details
- `GET /api/versions` - Version history
- `GET /api/indicators` - KPI data
- `GET /api/chat/messages` - Chat history
- `GET /api/filter-presets` - Saved filter presets

#### Auth Required
- `POST /api/chat/send` - Send message to PMO Bot (any user)
- `POST /api/filter-presets` - Save filter preset (any user)
- `DELETE /api/filter-presets/:id` - Delete filter preset (any user)

#### Editor Required
- `POST /api/projects` - Create project
- `POST /api/projects/bulk/update` - Bulk update projects
- `POST /api/excel/upload` - Upload Excel file
- `POST /api/projects/export` - Export projects to Excel

#### Admin Required
- `POST /api/projects/bulk/delete` - Bulk delete projects
- `DELETE /api/chat/clear` - Clear chat history
- `GET /api/admin/users` - List all users
- `PATCH /api/admin/users/:id/role` - Update user role

### Traffic Light Rules
**Primary**: Uses "ESTATUS AL DÍA" column from Excel EXCLUSIVELY when the field exists:
- **Green**: "On time", "A tiempo", "En tiempo"
- **Red**: "En riesgo ente >1<2 meses", "En riesgo o vencido > 2 meses" (any value containing "riesgo" or "vencido")
- **Yellow**: "Stand by", "Standby", "En espera"
- **Gray**: "No iniciado", "Cancelado", empty/null values

**Fallback** (ONLY if estatusAlDia is completely undefined):
- **Green**: On track or closed status
- **Yellow**: Within 7 days of deadline
- **Red**: Overdue and not closed
- **Gray**: TBD date or no date specified

**IMPORTANT**: Empty estatusAlDia returns GRAY without date fallback.

### Excel Parser Features
- Deterministic S/N parsing (S: status N: next steps)
- Row-level error handling:
  - **Soft errors**: Create draft projects (missing name → placeholder, invalid dates → flagged)
  - **Hard errors**: Skip rows (unreadable data)
- Flexible column mapping for project name and legacy ID
- Result counters: proyectosCreados, proyectosBorradorIncompleto, filasDescartadas

### User Preferences
- Language: Spanish (ES-MX)
- Zero hallucination requirement for all data
- Complete audit trail for all changes
- Fluent Design System adapted for data-heavy applications

## Running the Project
```bash
npm run dev          # Start development server
npm run db:push      # Push schema to database
```

## Recent Changes
- December 9, 2025: Semantic PMO Field Organization
  - **Dashboard Cleanup**: Removed redundant "Distribución por Estado" chart that duplicated traffic light information
  - **7 PMO Categories**: ExtraFields now organized into semantic sections for RAG-ready data structure:
    - Gobierno y Roles (Black Belt Lead, DTC Lead, Business Process Analyst)
    - Priorización y Scoring (Ranking, Puntaje Total, Total Valor/Esfuerzo)
    - Impacto Financiero (Business Impact USD, Beneficios, Soft Savings)
    - Estado y Fase (Tipo de Iniciativa, Fase DMAIC, Acciones a ejecutar)
    - Dependencias (IT Local, T. Digital, Digitalización, SSC)
    - Tiempo y Ciclo (T. de Ciclo en días, períodos mensuales)
    - Alcance y Región (Área de Productividad, Nacional/Local/NLATAM)
  - **Collapsible Sections**: Each category expands/collapses with badge showing field counts
  - **Exact Field Names**: All Excel column names preserved without translation or renaming
  - **Otros Campos**: Uncategorized fields grouped separately

- December 9, 2025: Complete Field Display & Traffic Light Fix
  - **ESTATUS AL DÍA Priority**: Traffic light now uses estatusAlDia EXCLUSIVELY - empty/null values return gray without date fallback
  - **6 Exact Values**: On time (green), Stand by (yellow), En riesgo ente >1<2 meses (red), En riesgo o vencido > 2 meses (red), No iniciado (gray), Cancelado (gray)
  - **Expanded Project Drawer**: Now shows ALL fields organized in sections: Identificación, Responsables, Fechas, Avance
  - **Extra Fields Display**: All unmapped Excel columns visible in "Datos Adicionales del Excel" section (even empty ones shown as "—")
  - **Field Names Match Excel**: Líder/Solicitante, Dueño del Proceso/Sponsor, Proceso de Negocio/Área, Fecha Término Estimada, Estatus al Día

- December 3, 2025: Strict Two-Sheet Parser
  - **ONLY TWO SHEETS**: Parser now ONLY reads "Proyectos PGP" and "Indicadores" - all other 32+ sheets ignored
  - **No fallback**: If "Proyectos PGP" not found, parser returns error (no alternative sheets used)
  - **Simplified logging**: Only shows relevant sheet names, not all 34 sheets
  - **Indicators parser**: New `parseIndicatorsSheet()` function for "Indicadores" or "Indicadoress" sheet
  - **197 projects** correctly parsed from "Proyectos PGP" sheet

- December 3, 2025: Phase 2 Complete
  - Multi-user role management with Replit Auth
  - Bulk update/delete capabilities with multi-select
  - Enhanced Excel importer with row-level error handling
  - Advanced filtering with saved presets
  - Excel export with filter support
  - All write endpoints protected with role-based middleware
  - First user automatically becomes Admin
  - Dashboard alerts for overdue, approaching deadline, and stale projects

