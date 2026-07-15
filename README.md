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
- **Infrastructure** (`src/infrastructure/`) — Prisma repositories, and the Claude/Mureka/Resend client adapters.
- **Presentation** (`app/`) — Next.js Route Handlers and pages; thin wiring only.

Dependency Injection is plain constructor injection at each route's composition root (no DI container/framework). Full details: `docs/Architecture/System_Architecture.md`, `docs/Architecture/Domain_Model.md`, `docs/Architecture/Folder_Structure.md`, `docs/Architecture/Database_Model.md`.

## Technology Stack

**Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
**Backend:** Next.js Route Handlers, Prisma ORM
**Infrastructure:** Supabase (PostgreSQL), Anthropic Claude API, Mureka API, Resend, Vercel, Cloudflare
**Quality:** Vitest, Playwright, ESLint, Prettier, Husky

## Prerequisites

- Node.js 22.23.1 (pinned in `.nvmrc` and `package.json`'s `engines.node` — use `nvm use` to match it locally)
- npm
- A PostgreSQL database (e.g. a Supabase project)
- API keys for Anthropic Claude, Mureka, and Resend

## Installation

```bash
git clone <repository-url>
cd ai-song-campaign-platform
npm install   # also generates the Prisma Client automatically (postinstall)
cp .env.example .env   # then fill in real values — see Environment Variables below
npx prisma migrate deploy   # applies existing migrations to your database
npm run db:seed             # creates the required default Campaign row (idempotent)
```

## Environment Variables

All variables are validated by a Zod schema (`src/config/env.ts`) at startup — the app fails fast if one is missing or malformed. Full reference, including purpose and secrets policy: `docs/Development/Environment.md`.

| Variable                                                  | Purpose                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`                                    | Public-facing application name.                                                                    |
| `NEXT_PUBLIC_APP_URL`                                     | Public base URL of the deployed app.                                                               |
| `SUPABASE_URL`                                            | Supabase project URL.                                                                              |
| `SUPABASE_ANON_KEY`                                       | Supabase public/anon key.                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`                               | Supabase service-role key (server-only).                                                           |
| `DATABASE_URL`                                            | PostgreSQL connection string used by Prisma.                                                       |
| `RESEND_API_KEY`                                          | Resend API key (email delivery).                                                                   |
| `EMAIL_FROM`                                              | Verified sender address used for outgoing email.                                                   |
| `R2_ACCOUNT_ID`                                           | Cloudflare account ID (validated, not used to build the endpoint).                                 |
| `R2_ENDPOINT`                                             | Cloudflare R2 S3-compatible API endpoint.                                                          |
| `R2_ACCESS_KEY_ID`                                        | R2 access key ID.                                                                                  |
| `R2_SECRET_ACCESS_KEY`                                    | R2 secret access key.                                                                              |
| `R2_BUCKET`                                               | R2 bucket name. Private — no public access; downloads are served via short-lived signed URLs.      |
| `CLAUDE_API_KEY`                                          | Anthropic Claude API key (moderation + lyrics).                                                    |
| `MUREKA_API_KEY`                                          | Mureka API key — the active music provider.                                                        |
| `ADMIN_EMAIL`                                             | Admin panel contact/notification address.                                                          |
| `ADMIN_SESSION_SECRET`                                    | 32+ char secret signing admin session cookies.                                                     |
| `CAMPAIGN_NAME`                                           | Display name of the current campaign.                                                              |
| `MAX_LYRIC_ATTEMPTS`                                      | Lyric attempts allowed per lead.                                                                   |
| `CAMPAIGN_MAX_SONGS`                                      | Campaign-wide song generation cap.                                                                 |
| `GENERATION_TIMEOUT_MINUTES`                              | Minutes a Song may stay `GENERATING` before being reclaimed as `FAILED`. Optional, default `30`.   |
| `CRON_SECRET`                                             | 32+ char secret protecting every `/api/internal/*` endpoint (external scheduler, health check).    |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile keys. Optional locally (public test keypair default); required in production. |

Nine more rate-limiting variables (`RATE_LIMIT_WINDOW_MINUTES`, `MAX_REGISTRATIONS_PER_IP`, `MAX_REGISTRATIONS_PER_EMAIL`, `MAX_GENERATIONS_PER_HOUR`, `MAX_GENERATIONS_PER_IP_PER_HOUR`, `MAX_APPROVALS_PER_HOUR`, `MAX_SESSION_REQUESTS_PER_WINDOW`, `SESSION_RATE_LIMIT_WINDOW_MINUTES`, `MAX_ADMIN_LOGIN_ATTEMPTS_PER_WINDOW`) are all optional, each with a built-in default. Full per-variable reference, including every one of those: `docs/Development/Environment.md`.

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
npm install                  # runs `prisma generate` automatically (postinstall) — does NOT touch the database
npx prisma migrate deploy    # applies any pending migrations to the production database — see checklist below
npm run build                # next build --turbopack
npm run start                # next start
```

- The Node.js version is pinned (`.nvmrc`, `package.json`'s `engines.node`) so the hosting provider (e.g. Vercel) uses the same runtime as development, rather than an implicit platform default.
- Prisma Client generation is guaranteed by the repository itself (a `postinstall` script), not by relying on the hosting provider's automatic framework detection. **This is codegen only — `prisma generate` never reads or writes the database**, so it cannot apply a migration; nothing in this repository's build pipeline runs `prisma migrate deploy` automatically (no `postinstall`/`build` script, no CI workflow does it — the only GitHub Actions workflow is the pipeline scheduler below). Applying migrations to production is a deliberate, separate, manual step every time the schema changes — see the Deployment Checklist immediately below.
- Environment variables are configured in the hosting provider's project settings (e.g. Vercel), not committed to the repository — see `docs/Development/Environment.md`.
- **Run `npm run db:seed` once against the production database** (a Prisma Client seed script at `prisma/seed.ts`, idempotent — safe to run more than once). It creates the one record required for lead registration to work at all: the default `Campaign` row (`id = 00000000-0000-0000-0000-000000000000`, matching `DEFAULT_CAMPAIGN_ID` in `src/features/lead/components/RegistrationForm.tsx`). Without it, every `POST /api/leads` fails with a Prisma `P2003` foreign key error, since `Lead.campaignId` has no row to reference.
- Security headers (frame/content-type protections, HSTS, referrer/permissions policy) are configured in `next.config.ts` and apply to every route.
- **External Scheduler (RC-2 — Production Hardening)**: `.github/workflows/song-pipeline.yml`, a GitHub Actions workflow, hits `GET /api/internal/pipeline/run` every 10 minutes — this is what advances the song generation queue independent of user traffic, and is what lets `GenerationDispatcher` reclaim a Song stuck `GENERATING` past `GENERATION_TIMEOUT_MINUTES`. Requires `CRON_SECRET` set both in the hosting provider's environment configuration (so the app can validate it) and as a GitHub Secret of the same name (so the workflow can send it as `Authorization: Bearer $CRON_SECRET`), plus an `APP_URL` GitHub repository variable pointing at the deployed application — see `docs/Development/Environment.md`. Deploying without `CRON_SECRET` set in the hosting provider fails application startup entirely (see `src/config/env.ts`). The scheduler previously ran as a Vercel Cron job (`vercel.json`); that was replaced because the Vercel Hobby plan only allows cron jobs to run once per day, which broke every deployment at the 5-minute schedule RC-2 originally introduced. Trigger a run manually anytime from the repo's Actions tab (`workflow_dispatch`).
- **Operational health check**: `GET /api/internal/health` (same `CRON_SECRET`, sent as `Authorization: Bearer <token>`) reports database/R2/Resend/Mureka status — `200` when every dependency is healthy, `503` if any one isn't. Point an external uptime monitor at it once deployed. Note this check does **not** currently verify migration state (see checklist below) — a `P2021`/`P2022` ("relation"/"column does not exist") error only surfaces once a request actually touches the missing table or column.

### Deployment Checklist

Added after **HOTFIX-DB-1** (2026-07-30): production hit `P2021: relation "public.rate_limit_events" does not exist` because a Sprint 8.2 migration was never applied to the production database — nothing in the deploy pipeline enforced it, and the one-line mention in this file's own command block was easy to miss on a routine redeploy. Run through this list on **every** deployment that includes new migrations, not just the first one ever:

1. **Back up the production database first.** Supabase takes automatic daily backups, but before applying any migration, also trigger an on-demand backup/snapshot from the Supabase dashboard (Database → Backups) — cheap insurance, especially for a migration with a destructive step (a column rename or drop).
2. **Check what's pending before touching anything** — run, with the production `DATABASE_URL` in the environment:
   ```bash
   npx prisma migrate status
   ```
   This is read-only. It lists every migration under `prisma/migrations/` and whether the target database has already applied it — confirm which ones (if any) are pending before deciding to deploy.
3. **Apply pending migrations**, if step 2 shows any:
   ```bash
   npx prisma migrate deploy
   ```
   Always use this exact command in production — never `prisma migrate dev` (dev-only; can create new migrations or reset the database) and never `prisma db push` (bypasses the migration history table entirely, causing exactly the kind of drift this incident was about).
4. **Verify `_prisma_migrations` directly** after deploying — the row count should equal the number of folders under `prisma/migrations/`, and every row's `finished_at` should be non-null:
   ```sql
   SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at;
   ```
5. **Re-run `npx prisma migrate status`** and confirm it reports "Database schema is up to date!" before proceeding to `npm run build`.
6. **Deploy verification, after the new build is live**:
   - `GET /api/internal/health` returns `200` (database/R2/Resend/Mureka all reachable — see `HealthCheckService`).
   - Perform one real (or, outside a live campaign window, a disposable test) lead registration end to end and confirm no `500`/`P2021`/`P2022` in application logs.
   - If this deployment's migrations touched the song pipeline's columns (e.g. `songs.audioStorageKey`, `providerTaskId`), also confirm `GET /api/internal/pipeline/run` (with `CRON_SECRET`) returns `200` rather than a database error.

## License

Proprietary — internal campaign project (`package.json` is marked `private`). Not published or licensed for external use or redistribution.
