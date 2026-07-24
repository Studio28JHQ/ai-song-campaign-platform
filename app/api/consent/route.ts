import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { RecordConsentUseCase } from "@/application/consent/use-cases/RecordConsentUseCase";
import { CONSENT_POLICY_VERSION } from "@/config/constants";
import {
  CONSENT_SESSION_COOKIE,
  consentSessionCookieOptions,
} from "@/infrastructure/consent/consentSessionCookie";
import { getClientIp } from "@/infrastructure/http/getClientIp";
import { PrismaConsentRepository } from "@/infrastructure/persistence/prisma/consent/PrismaConsentRepository";
import { logger } from "@/shared/logger/logger";

/**
 * POST /api/consent — records acceptance of the Landing's cookie/privacy
 * banner (Feature 2 — Privacy Consent Module). If the visitor has no
 * `sessionId` cookie yet, one is generated here and set as a first-party
 * cookie; the anonymous `Consent` record is created in the same request.
 * A repeat call for an already-known session is a no-op read, never a
 * second Consent — see `RecordConsentUseCase`.
 */

const recordConsentUseCase = new RecordConsentUseCase(new PrismaConsentRepository());

export async function POST(request: Request): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(CONSENT_SESSION_COOKIE)?.value || crypto.randomUUID();

  const ipAddress = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";

  try {
    await recordConsentUseCase.execute({
      sessionId,
      ipAddress,
      userAgent,
      policyVersion: CONSENT_POLICY_VERSION,
    });

    const response = NextResponse.json({ accepted: true }, { status: 200 });
    response.cookies.set(CONSENT_SESSION_COOKIE, sessionId, consentSessionCookieOptions());
    return response;
  } catch (error) {
    logger.error("Unexpected error while recording consent", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "internal_error", message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
