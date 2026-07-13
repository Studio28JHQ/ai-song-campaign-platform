import { NextResponse } from "next/server";
import { z } from "zod";
import { GenerateSongUseCase } from "@/application/song/use-cases/GenerateSongUseCase";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaCampaignGate } from "@/infrastructure/persistence/prisma/song/PrismaCampaignGate";
import { PrismaMoodSunoPromptProvider } from "@/infrastructure/persistence/prisma/song/PrismaMoodSunoPromptProvider";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { SunoSongService } from "@/infrastructure/suno/SunoSongService";
import { BusinessRuleError, ExternalApiError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * POST /api/song/generate — generates the one final song for a lead from
 * their already-approved lyrics. This file only validates input, invokes
 * `GenerateSongUseCase`, and maps the result/errors to an HTTP response.
 * No business rule (lead/campaign/lyrics validation, duplicate
 * prevention) is evaluated here — those live in the Application and
 * Domain layers.
 */

const generateSongUseCase = new GenerateSongUseCase(
  new PrismaLeadRepository(),
  new PrismaLyricsRepository(),
  new PrismaSongRepository(),
  new PrismaCampaignGate(),
  new PrismaMoodSunoPromptProvider(),
  new SunoSongService(),
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

    // Only what the client needs — provider name, provider song id, and
    // any other Suno-internal detail are never exposed.
    return NextResponse.json(
      {
        songId: result.song.id,
        status: result.song.status,
        audioUrl: result.song.audioUrl,
      },
      { status: 201 },
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

  if (error instanceof ExternalApiError) {
    logger.error("Suno API failure while generating a song", {
      error: error.message,
      code: error.code,
    });

    return errorResponse(
      503,
      "suno_unavailable",
      "The song generation service is temporarily unavailable. Please try again shortly.",
    );
  }

  logger.error("Unexpected error while generating a song", {
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
