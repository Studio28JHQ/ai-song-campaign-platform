import { timingSafeEqual } from "crypto";
import { appConfig } from "@/config/app";

const BEARER_PREFIX = "Bearer ";

/**
 * Authenticates a request to one of the internal-only endpoints
 * (`/api/internal/*` — RC-2 Production Hardening: the Vercel Cron
 * pipeline tick, the operational health check) against the shared
 * `CRON_SECRET`. Vercel Cron automatically sends
 * `Authorization: Bearer $CRON_SECRET` on every scheduled invocation, so
 * no extra wiring is needed to protect a route this way — see
 * `appConfig.internal.cronSecret`.
 *
 * Compares with `timingSafeEqual`, the same pattern
 * `ScryptPasswordHasher` already uses, rather than `===`, so response
 * timing can't be used to guess the secret byte-by-byte. Buffers of
 * different lengths never call `timingSafeEqual` (it throws on a length
 * mismatch) — that itself is treated as "not authenticated" up front.
 */
export function verifyInternalSecret(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith(BEARER_PREFIX)) {
    return false;
  }

  const provided = Buffer.from(header.slice(BEARER_PREFIX.length));
  const expected = Buffer.from(appConfig.internal.cronSecret);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
