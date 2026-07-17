import { NextResponse, after } from "next/server";
import { z } from "zod";
import { ApproveLyricsUseCase } from "@/application/lyrics/use-cases/ApproveLyricsUseCase";
import { RateLimiter } from "@/application/security/services/RateLimiter";
import { SecurityEventRecorder } from "@/application/security/services/SecurityEventRecorder";
import { GenerateSongUseCase } from "@/application/song/use-cases/GenerateSongUseCase";
import { GenerationDispatcher } from "@/application/song/use-cases/GenerationDispatcher";
import { GenerationPoller } from "@/application/song/use-cases/GenerationPoller";
import { appConfig } from "@/config/app";
import { getLeadSession } from "@/infrastructure/auth/getLeadSession";
import { ResendEmailService } from "@/infrastructure/email/ResendEmailService";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaRateLimitRepository } from "@/infrastructure/persistence/prisma/security/PrismaRateLimitRepository";
import { PrismaCampaignGate } from "@/infrastructure/persistence/prisma/song/PrismaCampaignGate";
import { PrismaEmailDeliveryTracker } from "@/infrastructure/persistence/prisma/song/PrismaEmailDeliveryTracker";
import { PrismaMoodSunoPromptProvider } from "@/infrastructure/persistence/prisma/song/PrismaMoodSunoPromptProvider";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { HttpAudioDownloader } from "@/infrastructure/storage/HttpAudioDownloader";
import { CloudflareR2Storage } from "@/infrastructure/storage/CloudflareR2Storage";
import { R2AudioUrlResolver } from "@/infrastructure/storage/R2AudioUrlResolver";
import { MurekaSongService } from "@/infrastructure/mureka/MurekaSongService";
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
 * job (`GenerateSongUseCase` — fast, no external call) and schedules
 * `GenerationDispatcher` and `GenerationPoller` in the background via
 * `after()` (Sprint 9.1 — see PROJECT_MANIFEST.md). Approving lyrics
 * never generates the song inline — the response returns as soon as the
 * job is queued, without waiting for the dispatcher, the poller, or any provider
 * call.
 */

const leadRepository = new PrismaLeadRepository();
const lyricsRepository = new PrismaLyricsRepository();
const songRepository = new PrismaSongRepository();
const campaignGate = new PrismaCampaignGate();
const moodProvider = new PrismaMoodSunoPromptProvider();
const songGenerator = new MurekaSongService();
const emailSender = new ResendEmailService();
const emailDeliveryTracker = new PrismaEmailDeliveryTracker();

const approveLyricsUseCase = new ApproveLyricsUseCase(lyricsRepository);
const rateLimiter = new RateLimiter(new PrismaRateLimitRepository());
const securityEventRecorder = new SecurityEventRecorder(new PrismaAuditLogRepository());

const generateSongUseCase = new GenerateSongUseCase(
  leadRepository,
  lyricsRepository,
  songRepository,
  campaignGate,
);

const generationDispatcher = new GenerationDispatcher(
  songRepository,
  lyricsRepository,
  moodProvider,
  songGenerator,
);

const generationPoller = new GenerationPoller(
  songRepository,
  songGenerator,
  new HttpAudioDownloader(),
  new CloudflareR2Storage(),
  new R2AudioUrlResolver(),
  leadRepository,
  emailSender,
  emailDeliveryTracker,
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
    // below is never delayed by it. Any failure here is logged and never
    // crashes the request; both the dispatcher and the poller already
    // persist FAILED themselves before rethrowing. Submission and
    // completion are two separate concerns (Sprint 9.1 — see
    // `GenerationDispatcher`/`GenerationPoller`); they still run back to
    // back in this one background callback today, but neither depends
    // on the other still being in the same process to make progress.
    after(async () => {
      try {
        await generationDispatcher.execute();
        await generationPoller.execute();
      } catch (error) {
        logger.error("Background song generation failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

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
