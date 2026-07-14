# AI Song Campaign Platform

Version 1.0.0 — see `CHANGELOG.md` for release history.

## Overview

A temporary, one-month marketing campaign Landing Page. Parents register, describe their baby, and receive a personalized set of AI-generated lyrics to review; once approved, the platform generates a final AI song and emails it to them. An admin panel lets the campaign team monitor submissions, retry/resend stuck deliveries, and export leads as CSV.

This is not a general-purpose product — see `PROJECT_MANIFEST.md` for the full scope, business rules, and explicit non-goals (no multi-tenant support, no long-term scalability requirements, capped at ~3,000 songs over one month).

**Main flow:** Landing → Lead registration → Content moderation → Lyrics generation → Lyrics approval → Song generation → Email delivery → Administrator monitoring. See `docs/Product/User_Flow.md` for the full step-by-step behavior.

## Architecture

Modular monolith on Next.js 15 (App Router), following Clean Architecture and lightweight Domain-Driven Design — no microservices, no event-driven infrastructure. Four modules (`lead`, `lyrics`, `song`, `admin`) each cut through every layer:

- **Domain** (`src/domain/`) — entities, value objects, repository interfaces. No framework dependencies.
- **Application** (`src/application/`) — use cases orchestrating domain logic, depending only on domain + repository/service interfaces.
- **Infrastructure** (`src/infrastructure/`) — Prisma repositories, and the Claude/Suno/Resend client adapters.
- **Presentation** (`app/`) — Next.js Route Handlers and pages; thin wiring only.

Dependency Injection is plain constructor injection at each route's composition root (no DI container/framework). Full details: `docs/Architecture/System_Architecture.md`, `docs/Architecture/Domain_Model.md`, `docs/Architecture/Folder_Structure.md`, `docs/Architecture/Database_Model.md`.

## Technology Stack

**Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
**Backend:** Next.js Route Handlers, Prisma ORM
**Infrastructure:** Supabase (PostgreSQL), Anthropic Claude API, Suno API, Resend, Vercel, Cloudflare
**Quality:** Vitest, Playwright, ESLint, Prettier, Husky

## Prerequisites

- Node.js 20+
- npm
- A PostgreSQL database (e.g. a Supabase project)
- API keys for Anthropic Claude, Suno, and Resend

## Installation

```bash
git clone <repository-url>
cd ai-song-campaign-platform
npm install
cp .env.example .env   # then fill in real values — see Environment Variables below
npx prisma generate
npx prisma migrate deploy   # applies existing migrations to your database
```

## Environment Variables

All variables are validated by a Zod schema (`src/config/env.ts`) at startup — the app fails fast if one is missing or malformed. Full reference, including purpose and secrets policy: `docs/Development/Environment.md`.

| Variable                    | Purpose                                          |
| --------------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_APP_NAME`      | Public-facing application name.                  |
| `NEXT_PUBLIC_APP_URL`       | Public base URL of the deployed app.             |
| `SUPABASE_URL`              | Supabase project URL.                            |
| `SUPABASE_ANON_KEY`         | Supabase public/anon key.                        |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only).         |
| `DATABASE_URL`              | PostgreSQL connection string used by Prisma.     |
| `RESEND_API_KEY`            | Resend API key (email delivery).                 |
| `EMAIL_FROM`                | Verified sender address used for outgoing email. |
| `CLAUDE_API_KEY`            | Anthropic Claude API key (moderation + lyrics).  |
| `SUNO_API_KEY`              | Suno API key (song generation).                  |
| `ADMIN_EMAIL`               | Admin panel contact/notification address.        |
| `ADMIN_SESSION_SECRET`      | 32+ char secret signing admin session cookies.   |
| `CAMPAIGN_NAME`             | Display name of the current campaign.            |
| `MAX_LYRIC_ATTEMPTS`        | Lyric attempts allowed per lead.                 |
| `CAMPAIGN_MAX_SONGS`        | Campaign-wide song generation cap.               |

## Development

```bash
npm run dev            # start the dev server (Turbopack)
npm run lint           # ESLint
npm run format         # Prettier — write
npm run typecheck      # tsc --noEmit
```

Coding standards, workflow, and Git conventions: `docs/Development/Coding_Standards.md`, `docs/Development/Development_Workflow.md`, `docs/Development/Git_Workflow.md`.

## Testing

```bash
npm run test            # Vitest — unit, component, and API route tests
npm run test:watch      # Vitest in watch mode
npm run test:e2e        # Playwright end-to-end tests
```

## Production Deployment

```bash
npx prisma generate
npm run build           # next build --turbopack
npm run start           # next start
```

- Environment variables are configured in the hosting provider's project settings (e.g. Vercel), not committed to the repository — see `docs/Development/Environment.md`.
- Apply any pending Prisma migrations (`npx prisma migrate deploy`) against the production database before starting the new build.
- Security headers (frame/content-type protections, HSTS, referrer/permissions policy) are configured in `next.config.ts` and apply to every route.

## License

Proprietary — internal campaign project (`package.json` is marked `private`). Not published or licensed for external use or redistribution.
