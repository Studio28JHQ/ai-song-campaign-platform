import { NextResponse } from "next/server";
import { ResolveResumeTokenUseCase } from "@/application/lead/use-cases/ResolveResumeTokenUseCase";
import {
  LEAD_SESSION_COOKIE,
  leadSessionCookieOptions,
} from "@/infrastructure/auth/leadSessionCookie";
import { PrismaLeadSessionService } from "@/infrastructure/auth/PrismaLeadSessionService";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * GET /resume/[token] — "Resume journey by email". No authentication is
 * required to use this link (the token itself is the credential, the same
 * way a password-reset link works); it never trusts anything the client
 * sends beyond that one opaque token, and never accepts or exposes a Lead
 * id, email, or any other internal identifier.
 *
 * Reuses the existing workflow entirely rather than duplicating it: once
 * the token resolves to a lead, this issues a normal parent session (the
 * exact same `LeadSessionService`/cookie `POST /api/leads` already sets)
 * and redirects to whichever *existing* top-level page — `/generate` or
 * `/song` — already reconstructs the rest of the UI itself, dynamically,
 * from `GET /api/leads/session`. No workflow state is computed or cached
 * here beyond the one routing decision in `ResolveResumeTokenUseCase`.
 *
 * An invalid, unknown, or (structurally, once revocation exists) revoked
 * token is rejected without ever revealing why — it redirects home,
 * indistinguishable from any other "not registered yet" visit.
 */

const resolveResumeTokenUseCase = new ResolveResumeTokenUseCase(
  new PrismaLeadRepository(),
  new PrismaLyricsRepository(),
);
const leadSessionService = new PrismaLeadSessionService();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  try {
    const result = await resolveResumeTokenUseCase.execute({ token });
    const session = await leadSessionService.create(result.leadId);

    const response = NextResponse.redirect(new URL(`/${result.destination}`, request.url));
    response.cookies.set(LEAD_SESSION_COOKIE, session.token, leadSessionCookieOptions());

    return response;
  } catch (error) {
    if (error instanceof BusinessRuleError && error.code === "lead.resume_token_invalid") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    logger.error("Unexpected error while resolving a resume link", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.redirect(new URL("/", request.url));
  }
}
