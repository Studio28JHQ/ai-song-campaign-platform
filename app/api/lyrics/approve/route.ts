import { NextResponse, after } from "next/server";
import { z } from "zod";
import { ApproveLyricsUseCase } from "@/application/lyrics/use-cases/ApproveLyricsUseCase";
import { GenerateSongUseCase } from "@/application/song/use-cases/GenerateSongUseCase";
import { SongGenerationWorker } from "@/application/song/use-cases/SongGenerationWorker";
import { getLeadSession } from "@/infrastructure/auth/getLeadSession";
import { ResendEmailService } from "@/infrastructure/email/ResendEmailService";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaCampaignGate } from "@/infrastructure/persistence/prisma/song/PrismaCampaignGate";
import { PrismaEmailDeliveryTracker } from "@/infrastructure/persistence/prisma/song/PrismaEmailDeliveryTracker";
import { PrismaMoodSunoPromptProvider } from "@/infrastructure/persistence/prisma/song/PrismaMoodSunoPromptProvider";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { SunoSongService } from "@/infrastructure/suno/SunoSongService";
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
 * job (`GenerateSongUseCase` — fast, no external call) and schedules the
 * `SongGenerationWorker` in the background via `after()`. Approving
 * lyrics never generates the song inline — the response returns as soon
 * as the job is queued, without waiting for the worker or any provider
 * call.
 */

const leadRepository = new PrismaLeadRepository();
const lyricsRepository = new PrismaLyricsRepository();
const songRepository = new PrismaSongRepository();
const campaignGate = new PrismaCampaignGate();
const moodProvider = new PrismaMoodSunoPromptProvider();
const songGenerator = new SunoSongService();
const emailSender = new ResendEmailService();
const emailDeliveryTracker = new PrismaEmailDeliveryTracker();

const approveLyricsUseCase = new ApproveLyricsUseCase(lyricsRepository);

const generateSongUseCase = new GenerateSongUseCase(
  leadRepository,
  lyricsRepository,
  songRepository,
  campaignGate,
);

const songGenerationWorker = new SongGenerationWorker(
  songRepository,
  lyricsRepository,
  moodProvider,
  songGenerator,
  leadRepository,
  emailSender,
  emailDeliveryTracker,
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

  try {
    const result = await approveLyricsUseCase.execute(parsed.data);

    // Fast, DB-only intake — never calls the music provider. See
    // GenerateSongUseCase.
    await generateSongUseCase.execute({ leadId });

    // The actual generation is entirely backgrounded — the response
    // below is never delayed by it. Any failure here is logged and never
    // crashes the request; SongGenerationWorker already persists FAILED
    // itself before rethrowing.
    after(async () => {
      try {
        await songGenerationWorker.execute();
      } catch (error) {
        logger.error("Background song generation worker failed", {
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
