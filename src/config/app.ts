import "server-only";
import { env } from "./env";

/**
 * Structured, semantic view over the validated environment. Application
 * code should prefer importing the specific slice it needs from here
 * instead of reaching into `env` directly, so each module only depends on
 * the configuration it actually uses.
 */
export const appConfig = {
  name: env.NEXT_PUBLIC_APP_NAME,
  url: env.NEXT_PUBLIC_APP_URL,
  admin: {
    email: env.ADMIN_EMAIL,
    sessionSecret: env.ADMIN_SESSION_SECRET,
  },
  campaign: {
    name: env.CAMPAIGN_NAME,
    maxSongs: env.CAMPAIGN_MAX_SONGS,
    maxLyricAttempts: env.MAX_LYRIC_ATTEMPTS,
  },
  database: {
    url: env.DATABASE_URL,
  },
  supabase: {
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },
  resend: {
    apiKey: env.RESEND_API_KEY,
    fromAddress: env.EMAIL_FROM,
  },
  storage: {
    accountId: env.R2_ACCOUNT_ID,
    endpoint: env.R2_ENDPOINT,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
  },
  claude: {
    apiKey: env.CLAUDE_API_KEY,
  },
  suno: {
    apiKey: env.SUNO_API_KEY,
  },
  mureka: {
    apiKey: env.MUREKA_API_KEY,
  },
  // RC-2 — Production Hardening. Song generation pipeline operational
  // settings — see `GenerationDispatcher` (stuck-song reclaim).
  song: {
    generationTimeoutMinutes: env.GENERATION_TIMEOUT_MINUTES,
  },
  // RC-2 — Production Hardening. Shared secret for every internal-only
  // endpoint (`/api/internal/*`) — never derived from or compared against
  // anything user-facing.
  internal: {
    cronSecret: env.CRON_SECRET,
  },
  // Sprint 8.2 — Abuse Protection. Every limit lives here, never
  // hardcoded inside a route handler — see PROJECT_MANIFEST.md.
  security: {
    turnstile: {
      secretKey: env.TURNSTILE_SECRET_KEY,
      siteKey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    },
    rateLimit: {
      windowMinutes: env.RATE_LIMIT_WINDOW_MINUTES,
      maxRegistrationsPerIp: env.MAX_REGISTRATIONS_PER_IP,
      maxRegistrationsPerEmail: env.MAX_REGISTRATIONS_PER_EMAIL,
      maxGenerationsPerHour: env.MAX_GENERATIONS_PER_HOUR,
      maxGenerationsPerIpPerHour: env.MAX_GENERATIONS_PER_IP_PER_HOUR,
      maxApprovalsPerHour: env.MAX_APPROVALS_PER_HOUR,
      maxSessionRequestsPerWindow: env.MAX_SESSION_REQUESTS_PER_WINDOW,
      sessionWindowMinutes: env.SESSION_RATE_LIMIT_WINDOW_MINUTES,
      // RC-2 — Production Hardening.
      maxAdminLoginAttemptsPerWindow: env.MAX_ADMIN_LOGIN_ATTEMPTS_PER_WINDOW,
    },
  },
} as const;

/** Named re-exports matching the constant names in PROJECT_MANIFEST.md / Sprint 8.2. */
export const TURNSTILE_SECRET = env.TURNSTILE_SECRET_KEY;
export const TURNSTILE_SITE_KEY = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const RATE_LIMIT_WINDOW_MINUTES = env.RATE_LIMIT_WINDOW_MINUTES;
export const MAX_REGISTRATIONS_PER_IP = env.MAX_REGISTRATIONS_PER_IP;
export const MAX_REGISTRATIONS_PER_EMAIL = env.MAX_REGISTRATIONS_PER_EMAIL;
export const MAX_GENERATIONS_PER_HOUR = env.MAX_GENERATIONS_PER_HOUR;
export const MAX_GENERATIONS_PER_IP_PER_HOUR = env.MAX_GENERATIONS_PER_IP_PER_HOUR;
export const MAX_APPROVALS_PER_HOUR = env.MAX_APPROVALS_PER_HOUR;
export const MAX_SESSION_REQUESTS_PER_WINDOW = env.MAX_SESSION_REQUESTS_PER_WINDOW;
export const SESSION_RATE_LIMIT_WINDOW_MINUTES = env.SESSION_RATE_LIMIT_WINDOW_MINUTES;

export type AppConfig = typeof appConfig;
