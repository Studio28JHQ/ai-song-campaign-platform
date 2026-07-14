import { SongStatus } from "@/domain/song/types";

/**
 * The domain's `SongStatus` (`QUEUED`/`GENERATING`/`COMPLETED`/`FAILED`)
 * is now itself the public vocabulary (see PROJECT_MANIFEST.md —
 * Architecture exception, Sprint 7.5) — this is a passthrough kept as
 * the one seam where that could change again without touching every
 * call site (`POST /api/song/generate`, `GET /api/song/[songId]`,
 * `GET /api/leads/session`).
 */
export function toPublicSongStatus(status: SongStatus): string {
  return status;
}
