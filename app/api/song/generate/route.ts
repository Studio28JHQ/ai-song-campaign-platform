import { NextResponse, after } from "next/server";
import { z } from "zod";
import { GenerateSongUseCase } from "@/application/song/use-cases/GenerateSongUseCase";
import { getLeadSession } from "@/infrastructure/auth/getLeadSession";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaCampaignGate } from "@/infrastructure/persistence/prisma/song/PrismaCampaignGate";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { triggerPipelineTick } from "@/infrastructure/http/triggerPipelineTick";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import { toPublicSongStatus } from "../publicSongStatus";

/**
 * POST /api/song/generate — creates the queued Song job for a lead. This
 * file only validates input, invokes `GenerateSongUseCase` (the
 * synchronous, DB-only intake), kicks off the pipeline in the
 * background via `after()`/`triggerPipelineTick`, and responds
 * immediately with `202 Accepted` — it never waits for the music
 * provider. No business rule is evaluated here; those live in the
 * Application and Domain layers.
 *
 * As of Sprint 7.5, the parent-facing flow no longer calls this route
 * directly — `POST /api/lyrics/approve` creates the queued job itself
 * right after approval (see PROJECT_MANIFEST.md — Architecture
 * exception). This endpoint is kept, unchanged in behavior, since
 * `GenerateSongUseCase` is idempotent per lead (reuses an existing,
 * non-`COMPLETED` row rather than erroring).
 */

const leadRepository = new PrismaLeadRepository();
const lyricsRepository = new PrismaLyricsRepository();
const songRepository = new PrismaSongRepository();
const campaignGate = new PrismaCampaignGate();

const generateSongUseCase = new GenerateSongUseCase(
  leadRepository,
  lyricsRepository,
  songRepository,
  campaignGate,
);

const generateSongRequestSchema = z.object({}).strict();

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

  const parsed = generateSongRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The request payload is invalid.");
  }

  try {
    const result = await generateSongUseCase.execute({ leadId });

    // Scheduled with `after()` so it keeps running once the response has
    // been sent, without the caller ever waiting for it —
    // `triggerPipelineTick` never throws, and the pipeline endpoint it
    // calls keeps rescheduling itself until the song reaches a terminal
    // state (see `/api/internal/pipeline/run`). This request's own
    // origin (not `appConfig.url`) is what the self-call targets — see
    // `triggerPipelineTick`.
    const origin = new URL(request.url).origin;
    after(() => triggerPipelineTick(origin));

    return NextResponse.json(
      {
        songId: result.song.id,
        status: toPublicSongStatus(result.song.status),
        estimatedNextAction:
          "The song has entered the generation queue. You will be notified by email once it is ready.",
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
