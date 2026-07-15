import { NextResponse } from "next/server";
import { GetLeadSessionStateUseCase } from "@/application/lead/use-cases/GetLeadSessionStateUseCase";
import { RateLimiter } from "@/application/security/services/RateLimiter";
import { SecurityEventRecorder } from "@/application/security/services/SecurityEventRecorder";
import { appConfig } from "@/config/app";
import { getLeadSession } from "@/infrastructure/auth/getLeadSession";
import { getClientIp } from "@/infrastructure/http/getClientIp";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaRateLimitRepository } from "@/infrastructure/persistence/prisma/security/PrismaRateLimitRepository";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import { toPublicSongStatus } from "../../song/publicSongStatus";

/**
 * GET /api/leads/session — reconstructs everything the parent-facing UI
 * needs to resume the flow, entirely from the database: remaining
 * attempts, the approved Lyrics version (if any), and the current Song
 * (if any). The Lead is identified only via the session cookie (see
 * `getLeadSession`) — the browser never supplies a Lead id. This is the
 * backend-authority endpoint GATE 6.6 introduces; the frontend no longer
 * reconstructs this state from sessionStorage.
 */

const getLeadSessionStateUseCase = new GetLeadSessionStateUseCase(
  new PrismaLeadRepository(),
  new PrismaLyricsRepository(),
  new PrismaSongRepository(),
);
const rateLimiter = new RateLimiter(new PrismaRateLimitRepository());
const securityEventRecorder = new SecurityEventRecorder(new PrismaAuditLogRepository());

export async function GET(request: Request): Promise<NextResponse> {
  const leadId = await getLeadSession();

  if (!leadId) {
    return errorResponse(401, "no_session", "No active session.");
  }

  const ip = getClientIp(request);

  const sessionLimit = await rateLimiter.consume({
    key: `session:lead:${leadId}`,
    limit: appConfig.security.rateLimit.maxSessionRequestsPerWindow,
    windowMinutes: appConfig.security.rateLimit.sessionWindowMinutes,
  });
  if (!sessionLimit.allowed) {
    await securityEventRecorder.record({
      action: "rate_limit_exceeded",
      entity: "Lead",
      entityId: leadId,
      metadata: { ip, scope: "session_polling" },
    });
    return errorResponse(
      429,
      "too_many_requests",
      "Too many requests. Please wait a few minutes before trying again.",
    );
  }

  try {
    const result = await getLeadSessionStateUseCase.execute({ leadId });

    return NextResponse.json(
      {
        babyName: result.babyName,
        remainingAttempts: result.remainingAttempts,
        leadStatus: result.leadStatus,
        approvedLyrics: result.approvedLyrics,
        song: result.song
          ? {
              songId: result.song.id,
              status: toPublicSongStatus(result.song.status),
              audioUrl: result.song.audioUrl ?? undefined,
              duration: result.song.duration,
            }
          : null,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof BusinessRuleError && error.code === "session.lead_not_found") {
      return errorResponse(401, "no_session", "No active session.");
    }

    logger.error("Unexpected error while reconstructing session state", {
      error: error instanceof Error ? error.message : String(error),
    });

    return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
  }
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
