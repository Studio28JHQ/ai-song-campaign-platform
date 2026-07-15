const UNKNOWN_IP = "unknown";

/**
 * Best-effort client IP for rate limiting (Sprint 8.2 — Abuse
 * Protection), read directly from the Route Handler's own `Request` —
 * the existing request abstraction every route already receives, rather
 * than the ambient `next/headers()` API (which requires an active
 * Next.js request scope and breaks when a route handler is invoked
 * directly, e.g. in tests).
 *
 * `x-forwarded-for` is attacker-controllable on an arbitrary network, so
 * this is never trusted blindly in general — but this application only
 * ever runs behind Vercel's edge network, which overwrites the header
 * with the real connecting IP prepended before it reaches this code, so
 * the first entry is trustworthy in this specific deployment. IP-based
 * rate limiting is defense-in-depth here, not the sole abuse gate
 * (Turnstile + per-session/per-email limits cover the rest) — falling
 * back to `"unknown"` (which still rate-limits, just coarsely, across
 * every caller that reports no IP) is an acceptable failure mode.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [first] = forwardedFor.split(",");
    const ip = first?.trim();
    if (ip) return ip;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  return UNKNOWN_IP;
}
