import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { MoodSunoPromptProvider } from "../contracts/MoodSunoPromptProvider";
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
 */
export class ProcessSongGenerationUseCase {
  constructor(
    private readonly songRepository: SongRepository,
    private readonly lyricsRepository: LyricsRepository,
    private readonly moodProvider: MoodSunoPromptProvider,
    private readonly sunoGenerator: SunoGenerator,
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

      return { song: updated.toSnapshot() };
    } catch (error) {
      song.markFailed();
      await this.songRepository.update(song);
      throw error;
    }
  }
}
