import { NextResponse } from "next/server";
import { getLeadSession } from "@/infrastructure/auth/getLeadSession";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { R2AudioUrlResolver } from "@/infrastructure/storage/R2AudioUrlResolver";
import { logger } from "@/shared/logger/logger";
import { toPublicSongStatus } from "../publicSongStatus";

/**
 * GET /api/song/[songId] — the polling endpoint for the asynchronous
 * generation workflow kicked off by `POST /api/song/generate`. The
 * frontend is expected to poll this every 5 seconds (see
 * docs/Product/User_Flow.md); there is no WebSocket or SSE push here by
 * design.
 *
 * Requires a valid parent session cookie, and the song must belong to
 * that session's Lead — otherwise this responds identically to a
 * non-existent song (404), never confirming another lead's song exists.
 */

const songRepository = new PrismaSongRepository();
const audioUrlResolver = new R2AudioUrlResolver();

interface RouteContext {
  params: Promise<{ songId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { songId } = await context.params;

  if (!songId) {
    return errorResponse(400, "invalid_request", "A songId is required.");
  }

  const leadId = await getLeadSession();
  if (!leadId) {
    return errorResponse(401, "no_session", "No active session.");
  }

  try {
    const song = await songRepository.findById(songId);

    if (!song || song.leadId !== leadId) {
      return errorResponse(404, "song_not_found", "Song not found.");
    }

    const status = toPublicSongStatus(song.status);

    if (status === "COMPLETED" && song.audioStorageKey) {
      // Resolved fresh from the persisted R2 key — never a stored URL
      // (see `AudioUrlResolver`).
      const audioUrl = await audioUrlResolver.resolve(song.audioStorageKey);

      return NextResponse.json(
        { songId: song.id, status, audioUrl, duration: song.duration },
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
