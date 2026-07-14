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
  SUNO_API_KEY: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_SESSION_SECRET: z
    .string()
    .min(32, "ADMIN_SESSION_SECRET must be at least 32 characters long."),
  CAMPAIGN_NAME: z.string().min(1),
  MAX_LYRIC_ATTEMPTS: z.coerce.number().int().positive(),
  CAMPAIGN_MAX_SONGS: z.coerce.number().int().positive(),
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
