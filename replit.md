# PMO Continuous Improvement Dashboard

## Overview
A Project Management Office (PMO) dashboard for managing continuous improvement projects. The platform provides a centralized view of project status, performance, and key metrics. It features deterministic Excel data parsing, PostgreSQL persistence, role-based authentication, and a fact-based conversational AI assistant. The system aims to enhance project oversight, facilitate data-driven decision-making, and streamline continuous improvement initiatives within an organization.

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