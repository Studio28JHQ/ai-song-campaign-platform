import { cookies } from "next/headers";
import type { AdminSessionPayload } from "@/application/admin/contracts/SessionTokenService";
import { ADMIN_SESSION_COOKIE } from "./sessionCookie";
import { SignedSessionTokenService } from "./SignedSessionTokenService";

const sessionTokenService = new SignedSessionTokenService();

/**
 * Reads and verifies the admin session cookie for the current request
 * (Route Handler or Server Component). Returns `null` if missing,
 * tampered with, or expired.
 *
 * This is for reading *who* is logged in (e.g. to attribute an audit log
 * entry) — it is not the access-control gate itself. Every `/admin` page
 * and `/api/admin` route is already gated by `middleware.ts`; this helper
 * exists only for the routes that additionally need the acting admin's
 * identity.
 */
export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  return sessionTokenService.verify(token);
}
