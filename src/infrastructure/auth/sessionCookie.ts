/**
 * The one place the admin session cookie's name and shared attributes
 * are defined — used by the login/logout routes (to set/clear it),
 * `middleware.ts` (to gate `/admin` and `/api/admin`), and
 * `getAdminSession` (to read the current admin's identity).
 */
export const ADMIN_SESSION_COOKIE = "admin_session";

const EIGHT_HOURS_SECONDS = 60 * 60 * 8;
const FOURTEEN_DAYS_SECONDS = 60 * 60 * 24 * 14;

/**
 * Cookie attributes shared by every place that sets this cookie:
 * HTTP-only and secure, per the Security requirements in
 * docs/Product/User_Flow.md. `secure` is unconditional rather than
 * environment-dependent — `localhost` is a "potentially trustworthy
 * origin" per the Secure-Contexts spec, so browsers still set/send
 * `Secure` cookies during local `next dev` over plain HTTP, and
 * production (Vercel) is always HTTPS.
 */
export function adminSessionCookieOptions(rememberMe: boolean): {
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
    maxAge: rememberMe ? FOURTEEN_DAYS_SECONDS : EIGHT_HOURS_SECONDS,
  };
}
