import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/infrastructure/auth/sessionCookie";
import { SignedSessionTokenService } from "@/infrastructure/auth/SignedSessionTokenService";

/**
 * Gates every `/admin` page and `/api/admin` route behind a valid session
 * cookie (see docs/Architecture/System_Architecture.md — Authentication
 * Flow). `/admin/login` and the login/logout API routes are the only
 * exceptions — everything else redirects (pages) or returns `401`
 * (API routes) when the cookie is missing, tampered with, or expired.
 *
 * Uses Web Crypto (`crypto.subtle`, via `SignedSessionTokenService`)
 * rather than Node's `crypto` module so verification works unmodified in
 * the Edge runtime middleware normally runs under.
 */

const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/api/admin/login", "/api/admin/logout"]);

const sessionTokenService = new SignedSessionTokenService();

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = token ? await sessionTokenService.verify(token) : null;

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication required." },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/admin/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
