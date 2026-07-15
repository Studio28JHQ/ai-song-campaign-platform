import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { logger } from "@/shared/logger/logger";
import type { AudioDownloader } from "../contracts/AudioDownloader";
import type { AudioStorage } from "../contracts/AudioStorage";
import type { AudioUrlResolver } from "../contracts/AudioUrlResolver";
import type { EmailDeliveryTracker } from "../contracts/EmailDeliveryTracker";
import type { SongEmailSender } from "../contracts/SongEmailSender";
import type { SongGenerationProvider } from "../contracts/SongGenerationProvider";
import type { GenerationPollerResponse } from "../dto/GenerationPollerResponse";

const AUDIO_STORAGE_CONTENT_TYPE_FALLBACK = "audio/mpeg";

/**
 * The Song Queue's completion poller (Sprint 9.1 — Generation Pipeline
 * Refinement; see PROJECT_MANIFEST.md — Architecture exception, Sprint
 * 7.5). Picks up exactly where `GenerationDispatcher` leaves off: finds
 * the Song currently `GENERATING` (there is at most one, by
 * construction — the dispatcher enforces the one-concurrent-generation
 * limit) and asks the provider whether it has finished.
 *
 * - Still in progress → does nothing this run; a later invocation will
 *   ask again. No wait, no sleep, no loop — this method returns
 *   immediately either way.
 * - Finished successfully → downloads the audio from the provider's own
 *   (short-lived) URL, uploads it to R2, and persists only the
 *   resulting object key (`Song.audioStorageKey`) — never a signed URL,
 *   never the provider's URL (see `AudioUrlResolver`). Only then does it
 *   deliver the "song ready" email, resolving a fresh signed URL at the
 *   moment it's needed and never persisting it.
 * - Finished with an error → marks the Song `FAILED` with the provider's
 *   reported error, same recovery path as before this split (manual
 *   admin retry via `RetryFailedSongUseCase`).
 *
 * No provider-specific type or logic appears here — that lives entirely
 * in `src/infrastructure/`. How this gets invoked is deliberately not
 * this class's concern: today it is scheduled via Next.js's `after()`
 * right after `GenerationDispatcher` (see `app/api/lyrics/approve/route.ts`),
 * with no persistent worker process or message broker — see
 * PROJECT_MANIFEST.md. A future sprint could invoke the exact same
 * `execute()` from a scheduled job instead, repeatedly, independent of
 * the dispatcher's own schedule — this split is what makes that possible
 * without changing either class.
 */
export class GenerationPoller {
  constructor(
    private readonly songRepository: SongRepository,
    private readonly songGenerator: SongGenerationProvider,
    private readonly audioDownloader: AudioDownloader,
    private readonly audioStorage: AudioStorage,
    private readonly audioUrlResolver: AudioUrlResolver,
    private readonly leadRepository: LeadRepository,
    private readonly emailSender: SongEmailSender,
    private readonly deliveryTracker: EmailDeliveryTracker,
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

    const result = await this.songGenerator.pollGenerationStatus(song.providerTaskId);

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

    if (result.status === "ready_to_download") {
      song.recordProviderStatus(result.providerStatus ?? "completed", { completed: true });
      const updated = await this.songRepository.update(song);
      logger.info("Generation poller: provider finished, awaiting download", {
        songId: song.id,
        providerSongId: result.providerSongId,
      });
      return { song: updated.toSnapshot(), outcome: "ready_to_download" };
    }

    try {
      const audio = await this.audioDownloader.download(result.audioUrl);
      const storageKey = `songs/${song.id}.mp3`;

      await this.audioStorage.upload(
        storageKey,
        audio.bytes,
        audio.contentType || AUDIO_STORAGE_CONTENT_TYPE_FALLBACK,
      );

      song.markCompleted({
        providerSongId: result.providerSongId,
        audioStorageKey: storageKey,
        duration: result.duration,
      });
      const updated = await this.songRepository.update(song);

      await this.deliverReadyEmail(updated);

      return { song: updated.toSnapshot(), outcome: "completed" };
    } catch (error) {
      song.markFailed(error instanceof Error ? error.message : String(error));
      await this.songRepository.update(song);
      throw error;
    }
  }

  /**
   * Claims delivery before sending: the claim is atomic at the database
   * level (see `EmailDeliveryTracker`), so even if this poller somehow
   * ran twice for the same song, only one caller ever sends. Never
   * rethrows — an email failure must not undo an otherwise-successful
   * generation, and `COMPLETED -> FAILED` isn't a transition `Song`
   * allows.
   */
  private async deliverReadyEmail(song: Song): Promise<void> {
    try {
      const claimed = await this.deliveryTracker.claimDelivery(song.id);
      if (!claimed) return;

      const lead = await this.leadRepository.findById(song.leadId);
      if (!lead || !song.audioStorageKey) return;

      const audioUrl = await this.audioUrlResolver.resolve(song.audioStorageKey);

      await this.emailSender.sendSongReadyEmail({
        to: lead.email.toString(),
        parentName: lead.parentName,
        babyName: lead.babyName,
        songId: song.id,
        audioUrl,
        duration: song.duration,
      });
    } catch (error) {
      logger.error("Failed to send song-ready email", {
        songId: song.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
