import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import type { MoodSunoPromptProvider } from "../contracts/MoodSunoPromptProvider";
import type { SongGenerationProvider } from "../contracts/SongGenerationProvider";
import type { GenerationDispatcherResponse } from "../dto/GenerationDispatcherResponse";

/**
 * The Song Queue's dispatcher (Sprint 9.1 — Generation Pipeline
 * Refinement; see PROJECT_MANIFEST.md — Architecture exception, Sprint
 * 7.5). Responsible for exactly one thing: taking the oldest `QUEUED`
 * Song and submitting it to the injected `SongGenerationProvider`. It
 * never waits for the provider to finish — submission and completion are
 * two separate concerns (see `GenerationPoller`), which is what makes
 * this safe to run independently of any long-running request and ready
 * for a provider (Mureka) whose generation is genuinely asynchronous.
 *
 * Enforces the provider's one-concurrent-generation limit itself, same
 * mechanism as before this split: if a Song is already `GENERATING`,
 * this run does nothing and returns `null` — it never submits a second
 * job in parallel. No provider-specific type or logic appears here;
 * that lives entirely in `src/infrastructure/` (e.g. `SunoSongService`
 * today, a future `MurekaSongService` later, with zero changes to this
 * file).
 *
 * How this gets invoked is deliberately not this class's concern — see
 * `GenerationPoller`'s doc comment for the same note.
 */
export class GenerationDispatcher {
  constructor(
    private readonly songRepository: SongRepository,
    private readonly lyricsRepository: LyricsRepository,
    private readonly moodProvider: MoodSunoPromptProvider,
    private readonly songGenerator: SongGenerationProvider,
  ) {}

  async execute(): Promise<GenerationDispatcherResponse | null> {
    const alreadyGenerating = await this.songRepository.findGenerating();
    if (alreadyGenerating) {
      logger.info("Generation dispatcher: a generation is already in flight, skipping this run");
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

      const submission = await this.songGenerator.submitGeneration({
        lyrics: lyrics.content,
        moodName: mood.name,
        sunoPrompt: mood.sunoPrompt,
      });

      song.recordSubmission(submission);
      const updated = await this.songRepository.update(song);

      return { song: updated.toSnapshot() };
    } catch (error) {
      song.markFailed(error instanceof Error ? error.message : String(error));
      await this.songRepository.update(song);
      throw error;
    }
  }
}
