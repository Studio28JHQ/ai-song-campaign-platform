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
  },
  claude: {
    apiKey: env.CLAUDE_API_KEY,
  },
  suno: {
    apiKey: env.SUNO_API_KEY,
  },
} as const;

export type AppConfig = typeof appConfig;
