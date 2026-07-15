# Environment & Configuration

This document describes how environment variables and configuration are managed. It is a companion to `docs/Architecture/System_Architecture.md` — this file covers the operational side (what variables exist, how they're validated, how to run locally and in production); the code under `src/config/` is the implementation.

## Environment Variables

### Application, database, and provider credentials

| Variable                    | Purpose                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`      | Public-facing application name.                                                   |
| `NEXT_PUBLIC_APP_URL`       | Public base URL of the deployed app.                                              |
| `SUPABASE_URL`              | Supabase project URL.                                                             |
| `SUPABASE_ANON_KEY`         | Supabase public/anon key.                                                         |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only, full privileges).                         |
| `DATABASE_URL`              | PostgreSQL connection string used by Prisma.                                      |
| `RESEND_API_KEY`            | Resend API key for transactional email delivery.                                  |
| `EMAIL_FROM`                | The "from" address every transactional email is sent as.                          |
| `R2_ACCOUNT_ID`             | Cloudflare account id (used to construct the R2 endpoint, never hardcoded).       |
| `R2_ENDPOINT`               | S3-compatible endpoint URL for the Cloudflare R2 bucket.                          |
| `R2_ACCESS_KEY_ID`          | R2 access key id.                                                                 |
| `R2_SECRET_ACCESS_KEY`      | R2 secret access key.                                                             |
| `R2_BUCKET`                 | Name of the private R2 bucket generated audio is stored in.                       |
| `CLAUDE_API_KEY`            | Anthropic Claude API key (moderation + lyrics generation).                        |
| `MUREKA_API_KEY`            | Mureka API key — the active music provider (see `PROJECT_MANIFEST.md`).           |
| `ADMIN_EMAIL`               | Email address used to access/notify the admin panel.                              |
| `ADMIN_SESSION_SECRET`      | Long, random secret (32+ chars) used to sign admin session cookies.               |
| `CAMPAIGN_NAME`             | Display name of the current campaign.                                             |
| `MAX_LYRIC_ATTEMPTS`        | Number of lyric attempts allowed per lead (see `docs/Product/Business_Rules.md`). |
| `CAMPAIGN_MAX_SONGS`        | Campaign-wide song generation cap.                                                |

### Song generation pipeline (RC-2 — Production Hardening)

| Variable                     | Purpose                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GENERATION_TIMEOUT_MINUTES` | Minutes a `Song` may stay `GENERATING` before `GenerationDispatcher` reclaims it (marks it `FAILED`, freeing the one-concurrent-generation slot). Optional, defaults to `30`. |

### Internal operations (RC-2 — Production Hardening)

| Variable      | Purpose                                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET` | Long, random secret (32+ chars) protecting every `/api/internal/*` endpoint (the pipeline tick, the operational health check). The external scheduler (currently a GitHub Actions workflow — see "GitHub Actions Scheduler Secret" below) sends it as `Authorization: Bearer $CRON_SECRET` on every scheduled invocation. |

### Cloudflare Turnstile & rate limiting (Sprint 8.2 — Abuse Protection)

| Variable                              | Purpose                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `TURNSTILE_SECRET_KEY`                | Cloudflare Turnstile secret key. Optional locally (defaults to Cloudflare's public test key); required in production. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`      | Cloudflare Turnstile site key, exposed to the browser. Same default/production rule as above.                         |
| `RATE_LIMIT_WINDOW_MINUTES`           | Default sliding-window size (minutes) for rate limiting. Optional, defaults to `60`.                                  |
| `MAX_REGISTRATIONS_PER_IP`            | Max registrations per IP per window. Optional, defaults to `5`.                                                       |
| `MAX_REGISTRATIONS_PER_EMAIL`         | Max registrations per email per window. Optional, defaults to `3`.                                                    |
| `MAX_GENERATIONS_PER_HOUR`            | Max lyrics-generation requests per lead per hour. Optional, defaults to `10`.                                         |
| `MAX_GENERATIONS_PER_IP_PER_HOUR`     | Max lyrics-generation requests per IP per hour. Optional, defaults to `20`.                                           |
| `MAX_APPROVALS_PER_HOUR`              | Max lyrics-approval requests per lead per hour. Optional, defaults to `10`.                                           |
| `MAX_SESSION_REQUESTS_PER_WINDOW`     | Max session-status requests per window. Optional, defaults to `30`.                                                   |
| `SESSION_RATE_LIMIT_WINDOW_MINUTES`   | Sliding-window size (minutes) for session-status rate limiting. Optional, defaults to `1`.                            |
| `MAX_ADMIN_LOGIN_ATTEMPTS_PER_WINDOW` | Max `POST /api/admin/login` attempts per IP per window (RC-2 — Production Hardening). Optional, defaults to `10`.     |

`.env.example` documents every variable above with a placeholder (non-secret) value and must be kept in sync whenever a variable is added, renamed, or removed.

## Configuration Strategy

- `src/config/env.ts` is the **only** module allowed to read `process.env`. This is enforced by an ESLint rule (`no-restricted-properties`) scoped to `src/**`, so any other file reading `process.env` directly fails linting.
- All variables are validated with a Zod schema at import time. If a required variable is missing or malformed, importing `env` throws immediately — the application fails fast at startup instead of failing later, deep inside a feature, with a confusing error.
- `src/config/app.ts` builds a structured, semantic configuration object (`appConfig`) on top of `env`, grouped by concern (`campaign`, `supabase`, `resend`, ...). Application code should prefer importing the specific slice it needs from `appConfig` rather than reaching into `env` directly.
- `src/config/constants.ts` holds infrastructure-level constants only (timeouts, retry counts). Business rule values (attempt limits, campaign caps) come from configuration/environment, never from hardcoded constants.
- Both `env.ts` and `app.ts` are marked server-only (via the `server-only` package) since they carry secrets. They must never be imported from client components.
- Path aliases (`@/config`, `@/shared`, `@/domain`, `@/application`, `@/infrastructure`, `@/features`, `@/components`) all resolve through the single `@/*` → `./src/*` mapping in `tsconfig.json` — no per-folder alias entries are needed.

## Secrets Policy

- `.env`, `.env.local`, and all other real environment files are gitignored and must never be committed.
- `.env.example` contains placeholder values only — never real keys, tokens, or connection strings.
- Secrets are only ever passed in via the environment (local `.env` file, or the hosting provider's environment variable configuration) — never hardcoded in source.

## Local Development

1. Copy `.env.example` to `.env` (or `.env.local`).
2. Fill in real values for the services you need to exercise locally (a partial `.env` is fine while a feature doesn't yet depend on a given variable — `env.ts` will only fail once something actually imports it).
3. Run `npm run dev`.

## Production Deployment

- Environment variables are configured directly in Vercel's project settings (per environment: Production/Preview), not committed to the repository.
- Only variables prefixed `NEXT_PUBLIC_` are ever exposed to the browser; every other variable stays server-only, matching how `src/config/env.ts` and `src/config/app.ts` are structured.
- Rotating a key (Claude, Mureka, Resend, Supabase) only requires updating it in Vercel's environment configuration — no code change.
- **`CRON_SECRET` (RC-2 — Production Hardening)**: set this in Vercel's project settings like any other secret, so the deployed application can validate it. Deploying without `CRON_SECRET` set fails application startup entirely (see `src/config/env.ts`), so this cannot be silently skipped. The same secret also protects `GET /api/internal/health`.
- **Database migrations are not applied automatically by any build step or CI workflow** — `prisma generate` (the `postinstall` script) only regenerates the Prisma Client's TypeScript types from `prisma/schema.prisma`; it never touches the database. `npx prisma migrate deploy` must be run manually against `DATABASE_URL` for every deployment that includes new migrations (HOTFIX-DB-1 — a skipped migration is exactly what caused a production `P2021` error). See README.md's "Deployment Checklist" for the full manual procedure.

### External Scheduler (GitHub Actions)

The pipeline scheduler (RC-2 — Production Hardening) is `.github/workflows/song-pipeline.yml`, a GitHub Actions workflow — **not** Vercel Cron. Vercel's Hobby plan only allows cron jobs to run once per day, which broke every deployment once RC-2 introduced a 5-minute `vercel.json` cron; `vercel.json` has been removed. See "External Scheduler" in `docs/Architecture/System_Architecture.md` for the full architecture picture — the scheduler is an interchangeable infrastructure component, and GitHub Actions is simply the current implementation.

**Required GitHub repository configuration** (Settings → Secrets and variables → Actions):

| Name          | Kind     | Purpose                                                                                                                                                  |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET` | Secret   | Same value as the `CRON_SECRET` environment variable configured in Vercel. Never hardcoded in the workflow file — read via `${{ secrets.CRON_SECRET }}`. |
| `APP_URL`     | Variable | The deployed application's base URL (e.g. `https://campaign.example.com`). Not sensitive, so it's a repository **variable**, not a secret.               |

The workflow fails fast with a clear error if `APP_URL` isn't set, instead of silently calling an empty URL.

**Schedule** — `*/10 * * * *` (every 10 minutes, UTC). GitHub Actions schedules are best-effort, same tolerance the queue already had under Vercel Cron.

**Manual trigger** — From the repository's GitHub UI: Actions tab → "Song Pipeline Scheduler" → "Run workflow" (`workflow_dispatch`). Useful for verifying the pipeline end-to-end without waiting for the next scheduled tick, or for manually nudging the queue after an incident.

**Concurrency** — A `concurrency` group (`song-pipeline`, `cancel-in-progress: false`) means overlapping runs queue rather than racing each other; this mirrors `GenerationDispatcher`'s own one-concurrent-generation invariant at the scheduler level.
