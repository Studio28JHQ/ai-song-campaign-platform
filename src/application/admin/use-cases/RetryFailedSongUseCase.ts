import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import { BusinessRuleError } from "@/shared/errors";
import type { RetryFailedSongRequest } from "../dto/RetryFailedSongRequest";
import type { RetryFailedSongResponse } from "../dto/RetryFailedSongResponse";

/**
 * The manual "Retry" operational recovery action (see
 * docs/Product/User_Flow.md — Operational Recovery). Only ever available
 * for a `FAILED` Song. It resets the existing row back to `QUEUED` —
 * the same state a brand-new Song starts in — and stops there: it never
 * creates a new Song, never touches the Lead's lyric attempts, and never
 * regenerates lyrics, because it never calls the Lyrics module at all.
 *
 * Resuming generation from `QUEUED` is the Song Queue's job: the
 * caller (an API route) is expected to schedule `GenerationDispatcher`
 * (then `GenerationPoller`) immediately after this returns — this use case only performs the
 * synchronous status reset and the audit write, exactly mirroring how
 * `GenerateSongUseCase` only does the synchronous intake for a brand-new
 * Song (see PROJECT_MANIFEST.md — Architecture exception, Sprint 7.5).
 */
export class RetryFailedSongUseCase {
  constructor(
    private readonly songRepository: SongRepository,
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  async execute(request: RetryFailedSongRequest): Promise<RetryFailedSongResponse> {
    const song = await this.songRepository.findById(request.songId);

    if (!song) {
      throw new BusinessRuleError("Song not found.", {
        code: "admin.song_not_found",
        context: { songId: request.songId },
      });
    }

    if (song.status !== SongStatus.FAILED) {
      throw new BusinessRuleError("Only a failed song can be retried.", {
        code: "admin.song_retry_not_allowed",
        context: { songId: song.id, status: song.status },
      });
    }

    song.retryFromFailure();
    const updated = await this.songRepository.update(song);

    await this.auditLogRepository.create(
      AuditLogEntry.create({
        adminId: request.adminId,
        action: "retry_song",
        entity: "Song",
        entityId: updated.id,
      }),
    );

    return { song: updated.toSnapshot() };
  }
}
