/**
 * The one place the consent session cookie's name and shared attributes
 * are defined — used by `POST /api/consent` (to generate/set it) and
 * `POST /api/leads` (to read it, for associating an existing Consent
 * with the newly created Lead). Mirrors `leadSessionCookie.ts`, but this
 * cookie carries a bare, first-party random id, not a DB-backed lookup
 * token — the `Consent` row itself, keyed by this id, is the source of
 * truth (see `docs/Architecture/System_Architecture.md`).
 */
export const CONSENT_SESSION_COOKIE = "consent_session_id";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30; // matches the one-month campaign duration.

/**
 * `secure` is unconditional rather than environment-dependent —
 * `localhost` is a "potentially trustworthy origin" per the
 * Secure-Contexts spec, so browsers still set/send `Secure` cookies
 * during local `next dev` over plain HTTP, and production (Vercel) is
 * always HTTPS (see `leadSessionCookieOptions` for the same reasoning).
 */
export function consentSessionCookieOptions(): {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  };
}
