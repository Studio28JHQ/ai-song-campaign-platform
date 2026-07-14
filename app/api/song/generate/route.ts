import { NextResponse, after } from "next/server";
import { z } from "zod";
import { GenerateSongUseCase } from "@/application/song/use-cases/GenerateSongUseCase";
import { ProcessSongGenerationUseCase } from "@/application/song/use-cases/ProcessSongGenerationUseCase";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaCampaignGate } from "@/infrastructure/persistence/prisma/song/PrismaCampaignGate";
import { PrismaMoodSunoPromptProvider } from "@/infrastructure/persistence/prisma/song/PrismaMoodSunoPromptProvider";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { SunoSongService } from "@/infrastructure/suno/SunoSongService";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import { toPublicSongStatus } from "../publicSongStatus";

/**
 * POST /api/song/generate — kicks off song generation for a lead
 * asynchronously. This file only validates input, invokes
 * `GenerateSongUseCase` (the synchronous intake), schedules
 * `ProcessSongGenerationUseCase` (the actual Suno call) to run in the
 * background via Next.js's `after()`, and responds immediately with
 * `202 Accepted` — it never waits for Suno. No business rule is
 * evaluated here; those live in the Application and Domain layers. See
 * docs/Architecture/System_Architecture.md for the full sequence.
 */

const leadRepository = new PrismaLeadRepository();
const lyricsRepository = new PrismaLyricsRepository();
const songRepository = new PrismaSongRepository();
const campaignGate = new PrismaCampaignGate();
const moodProvider = new PrismaMoodSunoPromptProvider();
const sunoGenerator = new SunoSongService();

const generateSongUseCase = new GenerateSongUseCase(
  leadRepository,
  lyricsRepository,
  songRepository,
  campaignGate,
);

const processSongGenerationUseCase = new ProcessSongGenerationUseCase(
  songRepository,
  lyricsRepository,
  moodProvider,
  sunoGenerator,
);

const generateSongRequestSchema = z.object({ leadId: z.string().min(1) }).strict();

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  const parsed = generateSongRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The request payload is invalid.");
  }

  try {
    const result = await generateSongUseCase.execute(parsed.data);
    const songId = result.song.id;

    // Scheduled with `after()` so it keeps running once the response has
    // been sent, without the caller ever waiting for it. Any failure is
    // persisted as `FAILED` by the use case itself — nothing to do with
    // the rejection here except log it; it must never crash the request.
    after(async () => {
      try {
        await processSongGenerationUseCase.execute({ songId });
      } catch (error) {
        logger.error("Background song generation failed", {
          songId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return NextResponse.json(
      {
        songId,
        status: toPublicSongStatus(result.song.status),
        estimatedNextAction: `Poll GET /api/song/${songId} every 5 seconds until status is COMPLETED or FAILED.`,
      },
      { status: 202 },
    );
  } catch (error) {
    return handleUseCaseError(error);
  }
}

function handleUseCaseError(error: unknown): NextResponse {
  if (error instanceof BusinessRuleError) {
    if (error.code === "song.lead_not_found") {
      return errorResponse(404, "lead_not_found", error.message);
    }

    if (error.code === "song.already_exists") {
      return errorResponse(409, "song_already_exists", error.message);
    }

    if (error.code === "song.lyrics_not_approved") {
      return errorResponse(422, "lyrics_not_approved", error.message);
    }

    if (error.code === "song.campaign_disabled") {
      return errorResponse(422, "campaign_disabled", error.message);
    }

    return errorResponse(422, "business_rule_violation", error.message);
  }

  logger.error("Unexpected error while starting song generation", {
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
