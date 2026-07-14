import { SongStatus } from "@/domain/song/types";

/**
 * Translates the domain's `SongStatus` into the public API vocabulary
 * requested for this workflow (`PENDING`, `GENERATING`, `COMPLETED`,
 * `FAILED`). The domain keeps `READY` internally — renaming it would
 * cascade into the Prisma mapper, which is out of scope for this task —
 * so this is the one place that translation happens, shared by both
 * `POST /api/song/generate` and `GET /api/song/[songId]`.
 */
export function toPublicSongStatus(status: SongStatus): string {
  return status === SongStatus.READY ? "COMPLETED" : status;
}
