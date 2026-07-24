/**
 * Infrastructure-level constants only. Business rule values (attempt
 * limits, moods, campaign thresholds, etc.) come from `./app` /
 * `docs/Product/Business_Rules.md`, never from this file.
 */

export const HTTP_DEFAULT_TIMEOUT_MS = 10_000;
export const HTTP_DEFAULT_RETRY_COUNT = 2;
export const HTTP_DEFAULT_RETRY_DELAY_MS = 300;

/**
 * Cloudflare R2 stays private — every download goes through a signed
 * URL, generated fresh at read time and never persisted (Sprint 9.1 —
 * see `AudioUrlResolver`). Emailed/admin-viewed links must still work
 * well after generation, so this is long-lived by presigned-URL
 * standards (SigV4 supports up to 7 days) — not the few-minutes window
 * appropriate for a URL resolved and used in the same request.
 */
export const R2_SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

/**
 * The single Campaign row this application ever operates against (see
 * `prisma/seed.ts`, which upserts exactly this id, and
 * `RegistrationForm.tsx`, which submits it as every Lead's
 * `campaignId`). Version 1 supports one campaign only — see
 * PROJECT_MANIFEST.md — so admin/global-setting reads and writes (e.g.
 * the GTM container id) can address it directly instead of looking it
 * up.
 */
export const DEFAULT_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000000";

/**
 * The privacy/cookie consent policy version stamped on every `Consent`
 * record (`Consent.policyVersion`) — a fixed, server-defined value,
 * never supplied by the client, so a row always records which policy
 * text was actually in force when a visitor accepted it. Bump this when
 * the privacy policy's substance changes.
 */
export const CONSENT_POLICY_VERSION = "1.0";
