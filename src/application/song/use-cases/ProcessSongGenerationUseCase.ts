import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import type { EmailDeliveryTracker } from "../contracts/EmailDeliveryTracker";
import type { MoodSunoPromptProvider } from "../contracts/MoodSunoPromptProvider";
import type { SongEmailSender } from "../contracts/SongEmailSender";
import type { SunoGenerator } from "../contracts/SunoGenerator";
import type { ProcessSongGenerationRequest } from "../dto/ProcessSongGenerationRequest";
import type { ProcessSongGenerationResponse } from "../dto/ProcessSongGenerationResponse";

/**
 * Performs the actual song generation for an already-persisted, `PENDING`
 * (or retried `FAILED`) Song: moves it to `GENERATING`, makes the single
 * Suno request, and records the outcome as `READY` or `FAILED`.
 *
 * This is the background half of the asynchronous workflow (see
 * docs/Architecture/System_Architecture.md) — the API route invokes it
 * without awaiting completion, after already responding to the client
 * from `GenerateSongUseCase`. It is deliberately self-sufficient given
 * just a `songId`: it re-fetches the lyrics and mood itself rather than
 * receiving them from the caller, so it works the same way regardless of
 * how "background" execution is wired (an in-process callback today, a
 * real queue/worker later).
 *
 * Every failure — a missing lyrics/mood record, a Suno timeout, an
 * unavailable provider, or a malformed response — is persisted as
 * `FAILED`; it is never retried automatically (see
 * docs/Product/Business_Rules.md), leaving the row available for a
 * future manual retry via `GenerateSongUseCase`.
 *
 * On the one transition that ever reaches `READY` (`GENERATING ->
 * READY`), it also delivers the one-time "song ready" email — see
 * docs/Architecture/External_Services.md. A failure to send that email
 * never fails the use case itself (generation already succeeded); it is
 * only logged.
 */
export class ProcessSongGenerationUseCase {
  constructor(
    private readonly songRepository: SongRepository,
    private readonly lyricsRepository: LyricsRepository,
    private readonly moodProvider: MoodSunoPromptProvider,
    private readonly sunoGenerator: SunoGenerator,
    private readonly leadRepository: LeadRepository,
    private readonly emailSender: SongEmailSender,
    private readonly deliveryTracker: EmailDeliveryTracker,
  ) {}

  async execute(request: ProcessSongGenerationRequest): Promise<ProcessSongGenerationResponse> {
    const song = await this.songRepository.findById(request.songId);

    if (!song) {
      throw new BusinessRuleError("Song not found.", {
        code: "song.not_found",
        context: { songId: request.songId },
      });
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

      const result = await this.sunoGenerator.generateSong({
        lyrics: lyrics.content,
        moodName: mood.name,
        sunoPrompt: mood.sunoPrompt,
      });

      song.markReady(result);
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
   * level (see `EmailDeliveryTracker`), so even if this use case somehow
   * ran twice for the same song, only one caller ever sends. Never
   * rethrows — an email failure must not undo an otherwise-successful
   * generation, and `READY -> FAILED` isn't a transition `Song` allows.
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
