import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/infrastructure/auth/sessionCookie";

/** POST /api/admin/logout — clears the session cookie. No business rule to evaluate; this never fails. */
export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true }, { status: 200 });
  response.cookies.delete(ADMIN_SESSION_COOKIE);
  return response;
}
