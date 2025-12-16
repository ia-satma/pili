# PMO Continuous Improvement Dashboard

## Overview
A Project Management Office (PMO) dashboard designed for managing continuous improvement projects. This platform offers a centralized view of project status, performance metrics, and key indicators. It features deterministic Excel data parsing, PostgreSQL for data persistence, robust role-based authentication, and a fact-based conversational AI assistant. The system's core purpose is to enhance project oversight, facilitate data-driven decision-making, and streamline continuous improvement initiatives within an organization, ultimately driving business value and market potential.

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
-   **AI**: Google Gemini 1.5 Pro via Replit AI Integrations

### Core Architectural Decisions
-   **Deterministic Excel Parsing**: Implemented a strict two-sheet parser ("Proyectos PGP" and "Indicadores") with row-level error handling to ensure high data integrity during ingestion.
-   **Role-Based Access Control (RBAC)**: Enforced at the API level using middleware, defining granular permissions for Admin, Editor, and Viewer roles across various endpoints and functionalities (e.g., system configuration, agent management, data exports).
-   **Database Schema**: Designed comprehensively to support project management, user authentication, detailed change logging, KPI tracking, and conversational AI history. It includes tables for initiatives, snapshots, delta events, governance alerts, agent definitions, runs, and council reviews.
-   **Immutable Snapshot History**: The system captures immutable point-in-time snapshots of initiatives, enabling robust version control and time-travel capabilities without overwriting historical data.
-   **Delta Engine & Signal Detection**: Compares consecutive snapshots to generate delta events and detect governance alerts (e.g., ZOMBI, ANGUILA, OPTIMISTA) based on predefined criteria, enhancing proactive project oversight.
-   **AI Agent Subsystem**: Features a DB-grounded RAG-lite evidence pack service for agents, ensuring zero-hallucination. Agents run with council reviews (CHAIRMAN, CRITIC, QUANT) and utilize GPT-5.
-   **Job Queue System**: A DB-backed, asynchronous job queue handles tasks like Excel exports, committee packet generation, and chaser drafts, with robust locking, retry mechanisms, and stale lock detection.
-   **UI/UX**: Adopts `shadcn/ui` and Tailwind CSS to implement a Fluent Design System, optimized for data-heavy applications, providing consistent and intuitive user experiences across dashboards, grids, and system interfaces.
-   **System Documentation Generation**: Automated generation of key system documents (CHANGELOG, ARCHITECTURE, DATA_DICTIONARY, API_REFERENCE) to maintain up-to-date project knowledge.

### Key Features
-   **Dashboard**: Centralized view with KPI cards, traffic light summaries, charts, and automated alerts.
-   **Projects Grid**: Interactive Excel-like grid with inline editing, bulk updates, and advanced filtering.
-   **Traffic Light System**: Date-based visual indicators for project status.
-   **PMO Chatbot**: A zero-hallucination AI assistant providing insights grounded in database facts.
-   **PMO Scoring System**: Prioritization matrix (Value/Effort) for projects, including `Total Valor`, `Total Esfuerzo`, `Puntaje Total`, and `Ranking`, visualized in a quadrant (Quick Wins, Big Bets, Fill-Ins, Money Pit).
-   **Evidence Pack & Agent Fleet**: Infrastructure for AI agents to gather and process project evidence for various purposes (e.g., Committee Briefs, Risk Explanations).
-   **Rate Limiting & Evidence Caps**: Implemented for API endpoints and evidence packs to ensure system stability and performance.
-   **Telemetry & Observability**: API, agent, and job telemetry tables with automatic metric capture via middleware.
-   **Agent Health Monitoring**: Health endpoints showing API key status, smoke test capability, and agent fleet health.
-   **Quality Gates**: Daily evaluation runs with regression detection (>20% failure threshold triggers EVAL_REGRESSION alert).
-   **Cost & Load Guardrails**: Soft alerts for monthly AI cost ($100) and P95 API latency (2000ms) thresholds.
-   **Soft Data Reset**: Admin-only endpoint to truncate operational data while preserving configuration tables.

## External Dependencies
-   **PostgreSQL (Neon)**: Cloud-hosted relational database for all persistent data storage.
-   **Google Gemini 2.5 Pro**: Utilized for the PMO Chatbot (Pilar) and AI Agent functionality, adhering to strict zero-hallucination policies. Migrated from OpenAI GPT-5 on Dec 16, 2025.
-   **Replit AI Integrations**: Platform services used for integrating AI functionalities within the Replit environment.
-   **Replit Auth**: OpenID Connect-based authentication for user management and secure access.