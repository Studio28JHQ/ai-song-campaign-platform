import { NextResponse, after } from "next/server";
import { GenerationDispatcher } from "@/application/song/use-cases/GenerationDispatcher";
import { GenerationPoller } from "@/application/song/use-cases/GenerationPoller";
import { RetryFailedSongUseCase } from "@/application/admin/use-cases/RetryFailedSongUseCase";
import { ResendEmailService } from "@/infrastructure/email/ResendEmailService";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
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
 * POST /api/admin/songs/[songId]/retry — the "Retry" operational
 * recovery action (see docs/Product/User_Flow.md), available only for a
 * `FAILED` song. Resets the existing row to `QUEUED` synchronously, then
 * schedules the same Song Queue dispatcher+poller a brand-new song uses
 * (`GenerationDispatcher`/`GenerationPoller`, via `after()`) — it never
 * regenerates lyrics, never consumes another attempt, and never creates
 * a second Song row, since it reuses the same `songId` throughout. The
 * dispatcher itself picks the oldest `QUEUED` song rather than being
 * told which one to process, so retrying is simply re-queueing (see
 * PROJECT_MANIFEST.md — Architecture exception, Sprint 7.5). See
 * docs/Architecture/System_Architecture.md — Operational Recovery.
 */

const songRepository = new PrismaSongRepository();
const lyricsRepository = new PrismaLyricsRepository();
const leadRepository = new PrismaLeadRepository();
const moodProvider = new PrismaMoodSunoPromptProvider();
const songGenerator = new MurekaSongService();
const emailSender = new ResendEmailService();
const emailDeliveryTracker = new PrismaEmailDeliveryTracker();
const auditLogRepository = new PrismaAuditLogRepository();

const retryFailedSongUseCase = new RetryFailedSongUseCase(songRepository, auditLogRepository);

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
);

interface RouteContext {
  params: Promise<{ songId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { songId } = await context.params;

  if (!songId) {
    return errorResponse(400, "invalid_request", "A songId is required.");
  }

  const session = await getAdminSession();
  if (!session) {
    return errorResponse(401, "unauthorized", "Authentication required.");
  }

  try {
    const result = await retryFailedSongUseCase.execute({ songId, adminId: session.adminId });

    // Same "respond now, generate in the background" pattern as
    // POST /api/song/generate — the admin is never made to wait for the
    // music provider.
    after(async () => {
      try {
        await generationDispatcher.execute();
        await generationPoller.execute();
      } catch (error) {
        logger.error("Background song retry failed", {
          songId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return NextResponse.json({ songId, status: result.song.status }, { status: 202 });
  } catch (error) {
    return handleUseCaseError(error, songId);
  }
}

function handleUseCaseError(error: unknown, songId: string): NextResponse {
  if (error instanceof BusinessRuleError) {
    if (error.code === "admin.song_not_found") {
      return errorResponse(404, "song_not_found", error.message);
    }

    if (error.code === "admin.song_retry_not_allowed") {
      return errorResponse(422, "retry_not_allowed", error.message);
    }

    return errorResponse(422, "business_rule_violation", error.message);
  }

  logger.error("Unexpected error while retrying a failed song", {
    songId,
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
