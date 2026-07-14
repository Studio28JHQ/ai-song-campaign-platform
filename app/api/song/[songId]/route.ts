import { NextResponse } from "next/server";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { logger } from "@/shared/logger/logger";
import { toPublicSongStatus } from "../publicSongStatus";

/**
 * GET /api/song/[songId] — the polling endpoint for the asynchronous
 * generation workflow kicked off by `POST /api/song/generate`. The
 * frontend is expected to poll this every 5 seconds (see
 * docs/Product/User_Flow.md); there is no WebSocket or SSE push here by
 * design.
 */

const songRepository = new PrismaSongRepository();

interface RouteContext {
  params: Promise<{ songId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { songId } = await context.params;

  if (!songId) {
    return errorResponse(400, "invalid_request", "A songId is required.");
  }

  try {
    const song = await songRepository.findById(songId);

    if (!song) {
      return errorResponse(404, "song_not_found", "Song not found.");
    }

    const status = toPublicSongStatus(song.status);

    if (status === "COMPLETED") {
      return NextResponse.json(
        { songId: song.id, status, audioUrl: song.audioUrl, duration: song.duration },
        { status: 200 },
      );
    }

    // PENDING, GENERATING, and FAILED all return status only — no
    // provider detail, no audioUrl, per the polling contract.
    return NextResponse.json({ songId: song.id, status }, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error while fetching song status", {
      songId,
      error: error instanceof Error ? error.message : String(error),
    });

    return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
  }
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
