/**
 * The one place the parent session cookie's name and shared attributes
 * are defined — used by `POST /api/leads` (to set it) and
 * `getLeadSession` (to read it). Mirrors `sessionCookie.ts` (the Admin
 * module's equivalent), but this cookie carries an opaque, DB-backed
 * token rather than a signed payload — see `PrismaLeadSessionService`.
 */
export const LEAD_SESSION_COOKIE = "lead_session";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/**
 * `secure` is unconditional rather than environment-dependent —
 * `localhost` is a "potentially trustworthy origin" per the
 * Secure-Contexts spec, so browsers still set/send `Secure` cookies
 * during local `next dev` over plain HTTP, and production (Vercel) is
 * always HTTPS (see `adminSessionCookieOptions` for the same reasoning).
 */
export function leadSessionCookieOptions(): {
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
