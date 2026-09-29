import { AppError } from "@/shared/errors";

/**
 * When the fallback provider is allowed to take over — an explicit
 * whitelist, never an "anything went wrong" catch.
 *
 * The reason it is a whitelist is money. Both providers charge per
 * generation, so the only failures that may trigger a second, paid attempt
 * on another provider are the ones where we can reasonably assert the
 * first provider **did not generate anything**. An exhausted balance or
 * quota is exactly that: the provider refused the request outright, before
 * any audio existed, and told us so.
 *
 * Everything else is excluded, and the exclusions matter more than the
 * inclusions:
 *
 * - **Timeouts, connection resets, network failures** (`http_request_failed`)
 *   — the request may well have arrived and started generating. Falling
 *   back here is how you pay twice for one song.
 * - **5xx** — same ambiguity, one layer up. The request reached the
 *   provider; whether it was acted on is unknowable from here.
 * - **429 rate limiting** — transient by definition. The queue simply
 *   tries again on the next tick, which costs nothing.
 * - **400 invalid request** — our payload is wrong. Another provider would
 *   not fix our bug, and masking it would hide it.
 * - **401 / 403** — a credential or permission problem. This needs a human
 *   to look at configuration, and it must stay loud.
 * - **Download, FFmpeg, R2, email failures** — the provider already did its
 *   job and already charged for it. These never reach this policy (they
 *   happen after submission), and if they ever did, they are not listed.
 *
 * Widening this set is a deliberate, reviewable decision: add a code here
 * and a test next to it, never a broader `catch`.
 */
const FALLBACK_ELIGIBLE_ERROR_CODES: ReadonlySet<string> = new Set([
  "mureka.quota_exceeded",
  "lyria.quota_exceeded",
]);

/** The shared-error code of `error`, when it carries one. */
export function providerErrorCode(error: unknown): string | undefined {
  return error instanceof AppError ? error.code : undefined;
}

/**
 * Whether `error` proves the primary provider refused the request before
 * generating anything, and therefore that handing the song to the fallback
 * provider cannot result in paying for two generations.
 */
export function isFallbackEligible(error: unknown): boolean {
  const code = providerErrorCode(error);
  return code !== undefined && FALLBACK_ELIGIBLE_ERROR_CODES.has(code);
}
