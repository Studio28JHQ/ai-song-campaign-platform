import { cookies } from "next/headers";
import { LEAD_SESSION_COOKIE } from "./leadSessionCookie";
import { PrismaLeadSessionService } from "./PrismaLeadSessionService";

const leadSessionService = new PrismaLeadSessionService();

/**
 * Reads and resolves the parent session cookie for the current request —
 * the one place every parent-facing Route Handler identifies the Lead.
 * Returns `null` if the cookie is missing, unknown, or expired; the
 * browser never sends (and this never needs) a raw Lead id.
 */
export async function getLeadSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(LEAD_SESSION_COOKIE)?.value;
  if (!token) return null;

  return leadSessionService.resolve(token);
}
