import type { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import type { AudioDownloader } from "../contracts/AudioDownloader";
import type { GenerationPollerResponse } from "../dto/GenerationPollerResponse";
import type { SongCompletionService } from "../services/SongCompletionService";
import type { SongGenerationProviderRegistry } from "../services/SongGenerationProviderRegistry";

/**
 * The Song Queue's completion poller (Sprint 9.1 — Generation Pipeline
 * Refinement; see PROJECT_MANIFEST.md — Architecture exception, Sprint
 * 7.5). Picks up exactly where `GenerationDispatcher` leaves off: finds
 * the Song currently `GENERATING` (there is at most one, by
 * construction — the dispatcher enforces the one-concurrent-generation
 * limit) and asks the provider whether it has finished.
 *
 * - Still in progress → does nothing this run beyond recording the
 *   provider's raw status for diagnostics; a later invocation will ask
 *   again. No wait, no sleep, no loop — this method returns immediately
 *   either way.
 * - Finished successfully — Mureka's async `ready_to_download` result
 *   (the port also still structurally supports a hypothetical
 *   synchronous provider's `completed` result, going through the exact
 *   same handler) — downloads the audio from the provider's own
 *   (short-lived) URL, post-processes it via `AudioProcessor` (FFmpeg —
 *   enforces the campaign's 60-second cap with a 55s-60s fade-out; a
 *   shorter source is returned untouched, never padded), uploads the
 *   *processed* bytes to R2, persists only the resulting object key
 *   (`Song.audioStorageKey`) — never a signed URL, never the provider's
 *   URL (see `AudioUrlResolver`) — marks the Song `COMPLETED` with the
 *   processed audio's own measured duration (never the provider's
 *   self-reported one), and only once all of that has already
 *   succeeded, delivers the "song ready" email (Gate 9.5 — Complete
 *   End-to-End Song Delivery), resolving a fresh signed URL at the
 *   moment it's needed and never persisting it. Never marks `COMPLETED`
 *   unless processing and the upload both actually succeeded — a
 *   processing failure fails the Song exactly like a download or upload
 *   failure already did, through the same catch block below.
 * - Finished with an error → marks the Song `FAILED` with the provider's
 *   reported error, same recovery path as before this split (manual
 *   admin retry via `RetryFailedSongUseCase`).
 *
 * No provider-specific type or logic appears here — that lives entirely
 * in `src/infrastructure/`. How this gets invoked is deliberately not
 * this class's concern: it is scheduled via Next.js's `after()` right
 * after `GenerationDispatcher` on every user-facing request that touches
 * the queue (see `app/api/lyrics/approve/route.ts`), and independently,
 * on a fixed schedule, by the external scheduler
 * (`GET /api/internal/pipeline/run`, RC-2 — Production Hardening;
 * currently a GitHub Actions workflow — see
 * `.github/workflows/song-pipeline.yml`) — no persistent worker process
 * or message broker either way, see PROJECT_MANIFEST.md.
 */
export class GenerationPoller {
  constructor(
    private readonly songRepository: SongRepository,
    private readonly providerRegistry: SongGenerationProviderRegistry,
    private readonly audioDownloader: AudioDownloader,
    private readonly completionService: SongCompletionService,
  ) {}

  async execute(): Promise<GenerationPollerResponse | null> {
    const song = await this.songRepository.findGenerating();
    if (!song) {
      return null;
    }

    if (!song.providerTaskId) {
      logger.error("Generation poller: a generating song has no providerTaskId", {
        songId: song.id,
      });
      return null;
    }

    // The provider that actually generated this song, read off the row —
    // never the campaign's currently configured primary. An admin
    // switching the routing mid-generation must not redirect a song that
    // is already in flight to a provider that knows nothing about its task
    // id (see `Song.assignProvider`).
    const provider = this.providerRegistry.get(song.provider);

    if (!provider.pollGenerationStatus) {
      // Only reachable if a synchronous provider's song somehow stayed
      // `GENERATING`: its submission completes the song in the same
      // invocation, so there is no task to ask about. Failing loudly here
      // (rather than silently returning) lets the dispatcher's
      // stuck-song reclaim free the queue on a later tick.
      throw new BusinessRuleError(
        `Provider "${provider.name}" does not support polling, but song ${song.id} is still generating.`,
        {
          code: "song.provider_polling_unsupported",
          context: { songId: song.id, provider: provider.name },
        },
      );
    }

    const result = await provider.pollGenerationStatus(song.providerTaskId);

    if (result.status === "pending") {
      if (result.providerStatus) {
        song.recordProviderStatus(result.providerStatus);
        const updated = await this.songRepository.update(song);
        return { song: updated.toSnapshot(), outcome: "pending" };
      }
      return { song: song.toSnapshot(), outcome: "pending" };
    }

    if (result.status === "failed") {
      song.markFailed(result.error);
      const updated = await this.songRepository.update(song);
      return { song: updated.toSnapshot(), outcome: "failed" };
    }

    const outcome = result.status === "ready_to_download" ? "ready" : "completed";
    return this.downloadAndComplete(song, result, outcome);
  }

  /**
   * Downloads the finished audio from the provider's own (short-lived) URL
   * and hands the bytes to `SongCompletionService`, which owns everything
   * from FFmpeg onwards and is shared with the synchronous-provider path in
   * `GenerationDispatcher`. A download failure marks the Song `FAILED` and
   * rethrows, exactly as before this method delegated.
   */
  private async downloadAndComplete(
    song: Song,
    result: { providerSongId: string; audioUrl: string; duration: number | null },
    outcome: "completed" | "ready",
  ): Promise<GenerationPollerResponse> {
    let audio;

    try {
      audio = await this.audioDownloader.download(result.audioUrl);
    } catch (error) {
      song.markFailed(error instanceof Error ? error.message : String(error));
      await this.songRepository.update(song);
      throw error;
    }

    const updated = await this.completionService.complete(song, {
      bytes: audio.bytes,
      contentType: audio.contentType,
      providerSongId: result.providerSongId,
    });

    return { song: updated.toSnapshot(), outcome };
  }
}
