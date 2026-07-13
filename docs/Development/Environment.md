# Environment & Configuration

This document describes how environment variables and configuration are managed. It is a companion to `docs/Architecture/System_Architecture.md` — this file covers the operational side (what variables exist, how they're validated, how to run locally and in production); the code under `src/config/` is the implementation.

## Environment Variables

| Variable                    | Purpose                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`      | Public-facing application name.                                                   |
| `NEXT_PUBLIC_APP_URL`       | Public base URL of the deployed app.                                              |
| `SUPABASE_URL`              | Supabase project URL.                                                             |
| `SUPABASE_ANON_KEY`         | Supabase public/anon key.                                                         |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only, full privileges).                         |
| `DATABASE_URL`              | PostgreSQL connection string used by Prisma.                                      |
| `RESEND_API_KEY`            | Resend API key for transactional email delivery.                                  |
| `CLAUDE_API_KEY`            | Anthropic Claude API key (moderation + lyrics generation).                        |
| `SUNO_API_KEY`              | Suno API key (song generation).                                                   |
| `ADMIN_EMAIL`               | Email address used to access/notify the admin panel.                              |
| `CAMPAIGN_NAME`             | Display name of the current campaign.                                             |
| `MAX_LYRIC_ATTEMPTS`        | Number of lyric attempts allowed per lead (see `docs/Product/Business_Rules.md`). |
| `CAMPAIGN_MAX_SONGS`        | Campaign-wide song generation cap.                                                |

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
- Rotating a key (Claude, Suno, Resend, Supabase) only requires updating it in Vercel's environment configuration — no code change.
