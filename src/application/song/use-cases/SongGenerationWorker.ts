import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import type { EmailDeliveryTracker } from "../contracts/EmailDeliveryTracker";
import type { MoodSunoPromptProvider } from "../contracts/MoodSunoPromptProvider";
import type { SongEmailSender } from "../contracts/SongEmailSender";
import type { SongGenerationProvider } from "../contracts/SongGenerationProvider";
import type { SongGenerationWorkerResponse } from "../dto/SongGenerationWorkerResponse";

/**
 * The Song Queue's worker (see PROJECT_MANIFEST.md — Architecture
 * exception, Sprint 7.5): takes the oldest `QUEUED` Song, marks it
 * `GENERATING`, calls the injected `SongGenerationProvider`, persists the
 * result, and delivers the "song ready" email. Depends only on
 * application-layer ports — no provider-specific type or logic appears
 * here; that lives entirely in `src/infrastructure/` (e.g. `SunoSongService`
 * today, a future `MurekaSongService` later, with zero changes to this
 * file).
 *
 * Enforces the provider's one-concurrent-generation limit itself: if a
 * Song is already `GENERATING`, this run does nothing and returns `null`
 * — it never starts a second generation in parallel. This is what makes
 * the queue a real queue rather than just a renamed status field: no
 * matter how many requests concurrently create `QUEUED` rows (see
 * `GenerateSongUseCase`), at most one of them is ever being generated at
 * a time.
 *
 * How this gets invoked is deliberately not this class's concern: today
 * it is scheduled via Next.js's `after()` right after a Song is queued
 * (see `app/api/lyrics/approve/route.ts`), with no persistent worker
 * process or message broker — see PROJECT_MANIFEST.md. A future sprint
 * could invoke the exact same `execute()` from a scheduled job instead,
 * with no change to this class.
 */
export class SongGenerationWorker {
  constructor(
    private readonly songRepository: SongRepository,
    private readonly lyricsRepository: LyricsRepository,
    private readonly moodProvider: MoodSunoPromptProvider,
    private readonly songGenerator: SongGenerationProvider,
    private readonly leadRepository: LeadRepository,
    private readonly emailSender: SongEmailSender,
    private readonly deliveryTracker: EmailDeliveryTracker,
  ) {}

  async execute(): Promise<SongGenerationWorkerResponse | null> {
    const alreadyGenerating = await this.songRepository.findGenerating();
    if (alreadyGenerating) {
      logger.info("Song generation worker: a generation is already in flight, skipping this run");
      return null;
    }

    const song = await this.songRepository.findOldestQueued();
    if (!song) {
      return null;
    }

    song.markGenerating();
    await this.songRepository.update(song);

    try {
      const lyrics = await this.lyricsRepository.findById(song.lyricsId);

      if (!lyrics) {
        throw new BusinessRuleError("The approved lyrics for this song could not be found.", {
          code: "song.lyrics_not_found",
          context: { songId: song.id, lyricsId: song.lyricsId },
        });
      }

      const mood = await this.moodProvider.getMoodDetails(song.moodId);

      if (!mood) {
        throw new BusinessRuleError("The mood for this song could not be found.", {
          code: "song.mood_not_found",
          context: { songId: song.id, moodId: song.moodId },
        });
      }

      const result = await this.songGenerator.generateSong({
        lyrics: lyrics.content,
        moodName: mood.name,
        sunoPrompt: mood.sunoPrompt,
      });

      song.markCompleted(result);
      const updated = await this.songRepository.update(song);

      await this.deliverReadyEmail(updated);

      return { song: updated.toSnapshot() };
    } catch (error) {
      song.markFailed();
      await this.songRepository.update(song);
      throw error;
    }
  }

  /**
   * Claims delivery before sending: the claim is atomic at the database
   * level (see `EmailDeliveryTracker`), so even if this worker somehow
   * ran twice for the same song, only one caller ever sends. Never
   * rethrows — an email failure must not undo an otherwise-successful
   * generation, and `COMPLETED -> FAILED` isn't a transition `Song` allows.
   */
  private async deliverReadyEmail(song: Song): Promise<void> {
    try {
      const claimed = await this.deliveryTracker.claimDelivery(song.id);
      if (!claimed) return;

      const lead = await this.leadRepository.findById(song.leadId);
      if (!lead || !song.audioUrl) return;

      await this.emailSender.sendSongReadyEmail({
        to: lead.email.toString(),
        parentName: lead.parentName,
        babyName: lead.babyName,
        songId: song.id,
        audioUrl: song.audioUrl,
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
