# PCCScribe Workspace

## Overview

PCCScribe is a clinical note summarization platform for skilled nursing facilities (SNFs). It integrates with PCC (PointClickCare) via a browser extension to fetch clinical notes and uses Anthropic Claude AI to generate structured SOAP summaries and per-note-type summaries.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: Anthropic Claude (via Replit AI Integrations)
- **Frontend**: React 19 + Vite + Tailwind CSS v4 + shadcn/ui

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── pccscribe/         # React + Vite frontend web app (served at /)
│   └── api-server/        # Express API server (served at /api)
├── lib/
│   ├── api-spec/          # OpenAPI spec + Orval codegen config
│   ├── api-client-react/  # Generated React Query hooks
│   ├── api-zod/           # Generated Zod schemas from OpenAPI
│   ├── db/                # Drizzle ORM schema + DB connection
│   └── integrations-anthropic-ai/  # Anthropic Claude AI integration
├── scripts/               # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Key Features

1. **Patient Management** — Add, view, and manage SNF patients
2. **Note Ingestion** — Notes can be ingested via:
   - Browser Extension (POST to `/api/patients/:id/notes` with `source: "extension"`)
   - Manual entry through the UI
3. **AI Summarization** — Generate clinical SOAP summaries using Claude claude-sonnet-4-6
4. **Note Types Supported**: progress_notes, physician_orders, mds_assessment, care_plan, mar, nursing_notes, therapy_notes, dietary_notes, social_work_notes, other

## Database Schema

- `patients` — Patient demographic and facility info
- `clinical_notes` — Scraped/ingested clinical notes with type, date, author, content
- `summaries` — AI-generated summaries with full SOAP structure and per-note-type summaries

## API Endpoints

All under `/api`:
- `GET/POST /patients`
- `GET/PUT/DELETE /patients/:id`
- `GET/POST /patients/:id/notes`
- `DELETE /patients/:id/notes/:noteId`
- `GET /patients/:id/summaries`
- `POST /patients/:id/summaries/generate`
- `GET/DELETE /patients/:id/summaries/:summaryId`

## Browser Extension Integration

The browser extension scrapes PCC notes and posts them to:
```
POST /api/patients/:patientId/notes
{
  "source": "extension",
  "notes": [
    {
      "noteType": "progress_notes",
      "noteDate": "YYYY-MM-DD",
      "author": "Provider Name",
      "content": "Note text",
      "sourceUrl": "https://pcc.example.com/..."
    }
  ]
}
```

## AI Summary Structure

Each summary includes:
- **Level 1**: Master SOAP Summary (Subjective, Objective, Assessment, Plan)
- **Level 2A**: Per-note-type summaries (keyed by note type)
- **Level 2B**: One-liner clinical snapshot
- **Level 2C**: Key clinical events timeline
- Quality indicators: confidence badge, notes count, documentation gaps

## Environment Variables Required

- `DATABASE_URL` — PostgreSQL connection string (auto-provided by Replit)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Anthropic proxy URL (auto-provided)
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Anthropic API key (auto-provided)
- `PORT` — Service port (auto-provided per artifact)
- `SESSION_SECRET` — Session secret
