import type { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { appConfig } from "@/config/app";
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
 * that lives entirely in `src/infrastructure/` (e.g. `MurekaSongService`
 * today, a different provider adapter later, with zero changes to this
 * file).
 *
 * RC-2 — Production Hardening: the one-concurrent-generation slot could
 * previously be occupied forever by a Song whose submitting process
 * crashed or was killed mid-flight (e.g. a serverless function timeout)
 * before it ever reached a terminal state — nothing could ever dispatch
 * again. A Song still `GENERATING` past `GENERATION_TIMEOUT_MINUTES`
 * (`appConfig.song.generationTimeoutMinutes`) is now reclaimed at the
 * start of this same run: marked `FAILED` with a descriptive
 * `providerError`, freeing the slot so the oldest `QUEUED` song (if any)
 * is dispatched immediately after, in the same call — no manual database
 * intervention required. The existing admin retry flow
 * (`RetryFailedSongUseCase`) picks the reclaimed Song back up exactly
 * like any other `FAILED` song.
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
      if (!this.hasTimedOut(alreadyGenerating)) {
        logger.info("Generation dispatcher: a generation is already in flight, skipping this run");
        return null;
      }

      logger.error("Generation dispatcher: reclaiming a song stuck GENERATING past the timeout", {
        songId: alreadyGenerating.id,
        timeoutMinutes: appConfig.song.generationTimeoutMinutes,
      });
      alreadyGenerating.markFailed(
        `Generation timed out: still GENERATING after ${appConfig.song.generationTimeoutMinutes} minutes.`,
      );
      await this.songRepository.update(alreadyGenerating);
    }

    const oldestQueued = await this.songRepository.findOldestQueued();
    if (!oldestQueued) {
      return null;
    }

    oldestQueued.markGenerating();
    const song = await this.songRepository.claimQueued(oldestQueued);
    if (!song) {
      logger.info("Generation dispatcher: song was already claimed by another run, skipping", {
        songId: oldestQueued.id,
      });
      return null;
    }

    try {
      const lyrics = await this.lyricsRepository.findById(song.lyricsId);

      if (!lyrics) {
        throw new BusinessRuleError("The approved lyrics for this song could not be found.", {
          code: "song.lyrics_not_found",
          context: { songId: song.id, lyricsId: song.lyricsId },
        });
      }

      // Referential-integrity check only as of Sprint v1.1 (AI Musical
      // Direction) — `mood.name`/`mood.sunoPrompt` are no longer read
      // for the Mureka prompt (see `SongGenerationInput`), but a Song
      // whose `moodId` no longer resolves is still worth failing
      // loudly on, the same as a missing Lyrics row above.
      const mood = await this.moodProvider.getMoodDetails(song.moodId);

      if (!mood) {
        throw new BusinessRuleError("The mood for this song could not be found.", {
          code: "song.mood_not_found",
          context: { songId: song.id, moodId: song.moodId },
        });
      }

      // TEMPORARY — diagnostic only, remove once the legacy-lyrics
      // (pre-AI-Musical-Direction) backlog is cleared. Never logs lyrics
      // or any other user content — booleans and ids only.
      logger.info("GenerationDispatcher: preparing Mureka prompt inputs", {
        leadId: lyrics.leadId,
        lyricsId: lyrics.id,
        hasMusicMood: Boolean(lyrics.musicMood),
        hasMusicDirection: Boolean(lyrics.musicDirection),
      });

      // Sprint v1.1 — AI Musical Direction. Only `null` for a Lyrics row
      // created before this sprint (see `Lyrics.musicMood`'s doc
      // comment) — every row created going forward always has them.
      // Sprint v1.2 — AI Safety Hardening: `parentMessage` is
      // deliberately not checked here — it is no longer part of what
      // is sent to Mureka (see `SongGenerationInput`), so its presence
      // is irrelevant to whether this Song can be dispatched.
      if (!lyrics.musicMood || !lyrics.musicDirection) {
        throw new BusinessRuleError(
          "This song's approved lyrics have no musical direction to generate from.",
          {
            code: "song.music_direction_missing",
            context: { songId: song.id, lyricsId: lyrics.id },
          },
        );
      }

      // Sprint v1.2 — AI Safety Hardening: `lyrics.parentMessage` is
      // deliberately never passed here — the parent's raw message must
      // never reach Mureka (see `SongGenerationInput`).
      const submission = await this.songGenerator.submitGeneration({
        lyrics: lyrics.content,
        musicMood: lyrics.musicMood,
        musicDirection: lyrics.musicDirection,
        voice: lyrics.voice,
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

  /**
   * `submittedAt` (stamped once `GenerationDispatcher` itself has
   * successfully submitted the job) is the precise "generation actually
   * started" instant and is never touched by a later poll, so it's
   * preferred; a Song can briefly be `GENERATING` with `submittedAt`
   * still `null` (between `markGenerating()` and the submission call
   * completing) — `updatedAt` is set by that same `markGenerating()`
   * call, so it's a safe fallback for that narrow window.
   */
  private hasTimedOut(song: Song): boolean {
    const referenceTime = song.submittedAt ?? song.updatedAt;
    const elapsedMinutes = (Date.now() - referenceTime.getTime()) / 60_000;
    return elapsedMinutes > appConfig.song.generationTimeoutMinutes;
  }
}
