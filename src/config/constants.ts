/**
 * Infrastructure-level constants only. Business rule values (attempt
 * limits, moods, campaign thresholds, etc.) come from `./app` /
 * `docs/Product/Business_Rules.md`, never from this file.
 */

export const HTTP_DEFAULT_TIMEOUT_MS = 10_000;
export const HTTP_DEFAULT_RETRY_COUNT = 2;
export const HTTP_DEFAULT_RETRY_DELAY_MS = 300;

/** Cloudflare R2 stays private — every download goes through a short-lived, presigned URL. */
export const R2_SIGNED_URL_EXPIRY_SECONDS = 300;
