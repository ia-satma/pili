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
- **Green**: On track, deadline not approaching
- **Yellow**: Within 7 days of deadline
- **Red**: Overdue and not closed
- **Gray**: TBD date or no date specified

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
- December 3, 2025: Critical Parser Fix - Correct Sheet Selection
  - **Root cause found**: Parser was selecting "Proyectos por los líderes (2)" (91 projects) instead of "Proyectos PGP" (197 projects)
  - **Fix applied**: Strict EXACT match for "Proyectos PGP" sheet name (case-insensitive)
  - **Sheet structure**: Row 4 = headers, "Iniciativa" column = project names, "Card ID DevOps" = legacy ID
  - **197 projects** now correctly parsed with proper column mappings
  - **Column mappings fixed**: Added truncated column name variants, "valor / diferenciador" → benefits
  - **AutoFilter detection**: Parser uses Excel's AutoFilter to find header row automatically

- December 3, 2025: Phase 2 Complete
  - Multi-user role management with Replit Auth
  - Bulk update/delete capabilities with multi-select
  - Enhanced Excel importer with row-level error handling
  - Advanced filtering with saved presets
  - Excel export with filter support
  - All write endpoints protected with role-based middleware
  - First user automatically becomes Admin
  - Dashboard alerts for overdue, approaching deadline, and stale projects

