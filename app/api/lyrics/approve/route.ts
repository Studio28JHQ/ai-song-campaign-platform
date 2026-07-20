import { NextResponse, after } from "next/server";
import { z } from "zod";
import { ApproveLyricsUseCase } from "@/application/lyrics/use-cases/ApproveLyricsUseCase";
import { RateLimiter } from "@/application/security/services/RateLimiter";
import { SecurityEventRecorder } from "@/application/security/services/SecurityEventRecorder";
import { GenerateSongUseCase } from "@/application/song/use-cases/GenerateSongUseCase";
import { appConfig } from "@/config/app";
import { getLeadSession } from "@/infrastructure/auth/getLeadSession";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaRateLimitRepository } from "@/infrastructure/persistence/prisma/security/PrismaRateLimitRepository";
import { PrismaCampaignGate } from "@/infrastructure/persistence/prisma/song/PrismaCampaignGate";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { triggerPipelineTick } from "@/infrastructure/http/triggerPipelineTick";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * POST /api/lyrics/approve — approves a lyrics version for a lead. This
 * file only validates input, invokes `ApproveLyricsUseCase`, and maps the
 * result/errors to an HTTP response.
 *
 * Requires a valid parent session cookie (see `getLeadSession`) — this
 * route is only ever reachable by a caller who has already registered.
 *
 * Sprint 7.5 (see PROJECT_MANIFEST.md — Architecture exception): once
 * lyrics are approved, this route synchronously creates the queued Song
 * job (`GenerateSongUseCase` — fast, no external call) and kicks off the
 * pipeline via `triggerPipelineTick` in the background via `after()`
 * (Sprint 9.1 — see PROJECT_MANIFEST.md). Approving lyrics never
 * generates the song inline — the response returns as soon as the job is
 * queued, without waiting for the dispatcher, the poller, or any
 * provider call. `GenerationDispatcher`/`GenerationPoller` themselves
 * only ever run inside `/api/internal/pipeline/run`, which keeps
 * rescheduling itself until the song reaches a terminal state — this
 * route's `after()` just places the first call in that self-sustaining
 * chain, it never runs them directly (see `triggerPipelineTick`).
 */

const leadRepository = new PrismaLeadRepository();
const lyricsRepository = new PrismaLyricsRepository();
const songRepository = new PrismaSongRepository();
const campaignGate = new PrismaCampaignGate();

const approveLyricsUseCase = new ApproveLyricsUseCase(lyricsRepository);
const rateLimiter = new RateLimiter(new PrismaRateLimitRepository());
const securityEventRecorder = new SecurityEventRecorder(new PrismaAuditLogRepository());

const generateSongUseCase = new GenerateSongUseCase(
  leadRepository,
  lyricsRepository,
  songRepository,
  campaignGate,
);

const approveLyricsRequestSchema = z
  .object({
    lyricsId: z.string().min(1),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  const leadId = await getLeadSession();
  if (!leadId) {
    return errorResponse(401, "no_session", "No active session.");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  const parsed = approveLyricsRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The request payload is invalid.");
  }

  const approvalLimit = await rateLimiter.consume({
    key: `lyrics_approval:lead:${leadId}`,
    limit: appConfig.security.rateLimit.maxApprovalsPerHour,
    windowMinutes: appConfig.security.rateLimit.windowMinutes,
  });
  if (!approvalLimit.allowed) {
    await securityEventRecorder.record({
      action: "rate_limit_exceeded",
      entity: "Lead",
      entityId: leadId,
      metadata: { scope: "lyrics_approval" },
    });
    return errorResponse(
      429,
      "too_many_requests",
      "Too many requests. Please wait a few minutes before trying again.",
    );
  }

  try {
    const result = await approveLyricsUseCase.execute(parsed.data);

    // Fast, DB-only intake — never calls the music provider. See
    // GenerateSongUseCase.
    await generateSongUseCase.execute({ leadId });

    // The actual generation is entirely backgrounded — the response
    // below is never delayed by it. `triggerPipelineTick` never throws,
    // and the pipeline endpoint it calls keeps rescheduling itself (see
    // that route) until the song reaches a terminal state, so this is
    // only ever the chain's first link, not the whole thing. Passing
    // this request's own origin (not `appConfig.url`) is what makes the
    // self-call land back on the same server instance actually handling
    // this request — see `triggerPipelineTick`.
    const origin = new URL(request.url).origin;
    after(() => triggerPipelineTick(origin));

    return NextResponse.json({ lyrics: result.lyrics }, { status: 200 });
  } catch (error) {
    return handleUseCaseError(error);
  }
}

function handleUseCaseError(error: unknown): NextResponse {
  if (error instanceof BusinessRuleError) {
    if (error.code === "lyrics.not_found") {
      return errorResponse(404, "lyrics_not_found", error.message);
    }

    return errorResponse(422, "business_rule_violation", error.message);
  }

  logger.error("Unexpected error while approving lyrics", {
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
