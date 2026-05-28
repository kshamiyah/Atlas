# Atlas (PortfolioIQ)

**Atlas** is an AI-assisted web app for RCOG trainees to track ARCP progress, surface CiP/key-skill gaps, and generate structured Kaizen-ready portfolio entries from rough notes.

> **Public repository notice:** This repo is published for portfolio and engineering transparency. It is **not** packaged for self-hosting or end-user support. Do not commit secrets (`.env.local`, API keys, or production credentials). Use `.env.example` as a template only.

[Companion Chrome extension](https://github.com/kshamiyah/portfolioiq-extension)

## Why this project

Building a high-quality training portfolio is time-consuming and fragmented. PortfolioIQ reduces admin burden by combining:

- evidence sync from Kaizen (via extension),
- progress analytics against curriculum structure,
- AI-assisted drafting for faster, better-documented entries.

## Core Features

- Dashboard with trainee stage selection and CiP progress overview.
- Gap report showing uncovered key skills by CiP.
- Key-skill review workflow with confidence-based suggestion triage.
- AI entry generation from free-text clinical notes into structured templates.
- Magic-link authentication and user-scoped data access with Supabase.

## Tech Stack

- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS
- Backend/API: Next.js route handlers
- Data/Auth: Supabase (Postgres + Auth)
- AI: OpenAI + Anthropic SDK integrations
- Tooling: ESLint, npm scripts, GitHub Actions CI

## Project Structure

```text
app/          Next.js pages + API routes
components/   UI components and feature modules
lib/          Domain logic, AI prompts, Supabase clients, shared types
supabase/     SQL migrations and Supabase config
scripts/      Utility scripts (for data/seed verification)
```

## Local Setup

1. Install dependencies:

```bash
npm ci
```

2. Create your local env file:

```bash
cp .env.example .env.local
```

3. Fill in required environment variables in `.env.local`.
4. Start the app:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Scripts

```bash
npm run dev     # start local dev server
npm run lint    # run eslint
npm run build   # production build
npm run start   # run production server
```

## CV Talking Points

- Designed a workflow-centric product for medical training portfolio management.
- Integrated LLM-based content generation with strict structured outputs.
- Built a full-stack TypeScript app with auth, analytics, and review pipelines.
- Implemented schema/migration-driven data modeling in Supabase.

## Disclaimer

Atlas / PortfolioIQ is an independent tool and is not affiliated with or endorsed by the RCOG or Kaizen. Curriculum text in migrations is used for product functionality; redistribution of modified curriculum data is your responsibility if you fork this project.
