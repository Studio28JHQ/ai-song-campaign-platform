import "server-only";
import { z } from "zod";

/**
 * The only module in this codebase allowed to read `process.env` directly
 * (enforced by the `no-restricted-properties` ESLint rule). Every other
 * module must import validated values from here or from `./app`.
 *
 * Parsing happens eagerly at import time so a missing or invalid variable
 * fails application startup immediately instead of surfacing later as an
 * obscure runtime error deep in a feature.
 */

const envSchema = z.object({
  // Set automatically by Next.js/Node (`next dev` vs `next build`/`next
  // start` vs the test runner) — never set by hand in `.env`. Used only
  // to gate verbose, stack-preserving error logging (see
  // `app/api/lyrics/generate/route.ts`) to non-production environments.
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  CLAUDE_API_KEY: z.string().min(1),
  MUREKA_API_KEY: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_SESSION_SECRET: z
    .string()
    .min(32, "ADMIN_SESSION_SECRET must be at least 32 characters long."),
  CAMPAIGN_NAME: z.string().min(1),
  // A required business rule (see docs/Product/Business_Rules.md —
  // Attempts Rules; currently 3), deliberately with no default, same as
  // `CAMPAIGN_MAX_SONGS` below — an unset value fails application
  // startup immediately via `loadEnv()`'s shared parse-and-throw, rather
  // than silently running the campaign under an unconfigured attempt
  // limit.
  MAX_LYRIC_ATTEMPTS: z.coerce.number().int().positive(),
  CAMPAIGN_MAX_SONGS: z.coerce.number().int().positive(),

  // RC-2 — Production Hardening. A Song stuck `GENERATING` past this many
  // minutes (e.g. the process that submitted it crashed or was killed
  // mid-flight) is reclaimed by `GenerationDispatcher` — marked `FAILED`
  // so it no longer occupies the campaign's one-concurrent-generation
  // slot forever. See `GenerationDispatcher`.
  GENERATION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),

  // RC-2 — Production Hardening. Shared secret for every internal-only
  // endpoint (`/api/internal/*`) — the pipeline tick and the operational
  // health check. Originally named to match Vercel Cron's own
  // convention; the scheduler is now a GitHub Actions workflow
  // (`.github/workflows/song-pipeline.yml`, HOTFIX — Vercel Hobby only
  // allows daily cron jobs) that explicitly sends
  // `Authorization: Bearer $CRON_SECRET` from a GitHub Secret of the
  // same name — this variable's name is kept unchanged since it's a
  // deployment-time secret, not a code contract, and renaming it would
  // only add churn. Never used for anything user-facing.
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters long."),

  // Sprint 8.2 — Abuse Protection. Required production secrets, same as
  // every other API credential above (`CLAUDE_API_KEY`, `MUREKA_API_KEY`,
  // etc.) — no default. Cloudflare's publicly documented "always passes"
  // test keypair (see
  // https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
  // is still fine to use as the actual *value* for local development —
  // set explicitly, like any other secret — but this schema no longer
  // silently substitutes it in when the variable is unset.
  TURNSTILE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
  MAX_REGISTRATIONS_PER_IP: z.coerce.number().int().positive().default(5),
  MAX_REGISTRATIONS_PER_EMAIL: z.coerce.number().int().positive().default(3),
  MAX_GENERATIONS_PER_HOUR: z.coerce.number().int().positive().default(10),
  MAX_GENERATIONS_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),
  MAX_APPROVALS_PER_HOUR: z.coerce.number().int().positive().default(10),
  MAX_SESSION_REQUESTS_PER_WINDOW: z.coerce.number().int().positive().default(30),
  SESSION_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(1),

  // RC-2 — Production Hardening. Admin login gets the same rate-limiting
  // treatment every public endpoint already has (Sprint 8.2) — keyed by
  // IP, windowed by the shared `RATE_LIMIT_WINDOW_MINUTES` above.
  MAX_ADMIN_LOGIN_ATTEMPTS_PER_WINDOW: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid or missing environment variables:\n${issues}`);
  }

  return parsed.data;
}

export const env = loadEnv();
