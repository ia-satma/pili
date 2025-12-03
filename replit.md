# PMO Continuous Improvement Dashboard

## Overview
A Project Management Office (PMO) dashboard for managing continuous improvement projects. The platform features deterministic Excel data parsing, PostgreSQL persistence, and a fact-based conversational assistant that only responds with verified database data.

## Project Architecture

### Tech Stack
- **Frontend**: React + TypeScript with Vite
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **UI Components**: shadcn/ui + Tailwind CSS
- **Charts**: Recharts
- **AI**: OpenAI GPT-5 via Replit AI Integrations

### Key Features
1. **Dashboard** - KPI cards showing project counts, traffic light summary, charts
2. **Projects Grid** - Excel-like data grid with inline editing capability
3. **Traffic Light System** - Date-based visual indicators (Green/Yellow/Red/Gray)
4. **Excel Upload** - Deterministic parsing with validation
5. **Version Control** - Complete audit trail and change tracking
6. **PMO Chatbot** - Zero-hallucination AI assistant that only cites database facts

### File Structure
```
├── client/src/
│   ├── components/          # Reusable UI components
│   │   ├── app-sidebar.tsx  # Navigation sidebar
│   │   ├── kpi-card.tsx     # KPI display cards
│   │   ├── traffic-light.tsx # Status indicators
│   │   ├── projects-grid.tsx # Data grid component
│   │   ├── excel-upload.tsx  # File upload component
│   │   ├── pmo-chat.tsx      # Chatbot interface
│   │   └── version-comparison.tsx # Change tracking
│   └── pages/               # Route pages
│       ├── dashboard.tsx
│       ├── projects.tsx
│       ├── indicators.tsx
│       ├── history.tsx
│       ├── upload.tsx
│       └── chat.tsx
├── server/
│   ├── db.ts               # Database connection
│   ├── storage.ts          # Database storage layer
│   ├── routes.ts           # API endpoints
│   ├── excel-parser.ts     # Deterministic Excel parsing
│   └── openai.ts           # AI integration for PMO Bot
└── shared/
    └── schema.ts           # Database schema (Drizzle)
```

### Database Schema
- `excel_versions` - Uploaded Excel file versions
- `projects` - Main project records
- `project_updates` - S/N parsed status updates
- `change_logs` - Complete audit trail
- `kpi_values` - Calculated KPIs per version
- `chat_messages` - PMO Bot conversation history

### API Endpoints
- `GET /api/dashboard` - Dashboard statistics
- `GET /api/projects` - All active projects
- `GET /api/projects/:id` - Project details
- `POST /api/excel/upload` - Upload Excel file
- `GET /api/versions` - Version history
- `GET /api/versions/compare` - Compare two versions
- `GET /api/indicators` - KPI data
- `POST /api/chat/send` - Send message to PMO Bot

### Traffic Light Rules
- **Green**: On track, deadline not approaching
- **Yellow**: Within 7 days of deadline
- **Red**: Overdue and not closed
- **Gray**: TBD date or no date specified

### S/N Parsing Rules (Deterministic)
The parser extracts Status (S:) and Next Steps (N:) from text fields:
- Pattern: `S: <status text> N: <next steps text>`
- No NLP or inference - purely regex-based
- Original text is always preserved

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
- December 3, 2025: MVP Complete
  - Complete frontend with all pages (Dashboard, Projects, Indicators, History, Upload, Chat)
  - Backend API endpoints with Zod validation
  - PostgreSQL integration with Drizzle ORM
  - PMO Bot with OpenAI integration and graceful fallback
  - SEO optimization with unique page titles and meta descriptions
  - End-to-end tested and verified working
