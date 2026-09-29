import type { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { appConfig } from "@/config/app";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import { SongStatus } from "@/domain/song/types";
import type { CampaignSettingsGate } from "@/application/campaign/contracts/CampaignSettingsGate";
import type { MoodSunoPromptProvider } from "../contracts/MoodSunoPromptProvider";
import type {
  SongGenerationInput,
  SongGenerationSubmission,
} from "../contracts/SongGenerationProvider";
import type { GenerationDispatcherResponse } from "../dto/GenerationDispatcherResponse";
import { isFallbackEligible, providerErrorCode } from "../services/providerFallbackPolicy";
import type { SongCompletionService } from "../services/SongCompletionService";
import type { SongGenerationProviderRegistry } from "../services/SongGenerationProviderRegistry";

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
    private readonly providerRegistry: SongGenerationProviderRegistry,
    private readonly routingGate: CampaignSettingsGate,
    private readonly completionService: SongCompletionService,
    private readonly campaignId: string,
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

    logger.info("generation_started", { songId: song.id, status: song.status });

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
      const submission = await this.submitWithFallback(song, {
        lyrics: lyrics.content,
        musicMood: lyrics.musicMood,
        musicDirection: lyrics.musicDirection,
        voice: lyrics.voice,
      });

      // An asynchronous provider handed back a task id: the song stays
      // `GENERATING` and `GenerationPoller` takes over on a later tick.
      if (submission.kind === "async") {
        song.recordSubmission({
          providerTaskId: submission.providerTaskId,
          providerTraceId: submission.providerTraceId,
        });
        const updated = await this.songRepository.update(song);

        return { song: updated.toSnapshot() };
      }

      if (submission.kind !== "immediate") {
        // Defensive: a provider returning a shape this version does not know
        // must fail loudly rather than be treated as "it handed us audio",
        // which would dereference fields that are not there.
        throw new BusinessRuleError("The provider returned an unrecognised submission result.", {
          code: "song.unknown_submission_kind",
          context: { songId: song.id, provider: song.provider },
        });
      }

      // A synchronous provider already generated the song inside the call
      // above and handed over the audio. There is nothing to poll, so this
      // same invocation finishes it — through the *same*
      // `SongCompletionService` the polling path uses, so FFmpeg's
      // 60-second cap, the R2 key convention and the one-time email are
      // byte-for-byte the same for both providers.
      song.recordImmediateSubmission();
      const completed = await this.completionService.complete(song, {
        bytes: submission.audio.bytes,
        contentType: submission.audio.contentType,
        providerSongId: submission.providerSongId,
      });

      return { song: completed.toSnapshot() };
    } catch (error) {
      // `SongCompletionService` already marks its own failures `FAILED`,
      // and `Song` has no `FAILED -> FAILED` transition, so re-marking
      // would throw a state-machine error over the top of the real cause.
      if (song.status === SongStatus.GENERATING) {
        song.markFailed(error instanceof Error ? error.message : String(error));
        await this.songRepository.update(song);
      }

      logger.error("generation_provider_failed", {
        songId: song.id,
        provider: song.provider,
        providerModel: song.providerModel,
        status: song.status,
        errorCode: providerErrorCode(error),
      });

      throw error;
    }
  }

  /**
   * Submits to the campaign's configured primary provider and, only for the
   * explicitly whitelisted pre-generation failures, retries once on the
   * configured fallback provider.
   *
   * Three properties this deliberately guarantees:
   * - **At most one fallback per song.** If the fallback also fails, the
   *   error propagates and the song ends `FAILED`. There is no chain.
   * - **Only the whitelist.** See `providerFallbackPolicy` — an ambiguous
   *   failure (timeout, connection reset, 5xx) never triggers a fallback,
   *   because the primary may already be generating a song we have paid
   *   for. Rate limits, bad payloads and credential errors do not either.
   * - **The provider is recorded before the call, not after.** So a failure
   *   leaves behind which provider was actually attempted, and the value
   *   `GenerationPoller` later reads always matches whoever really ran.
   */
  private async submitWithFallback(
    song: Song,
    input: SongGenerationInput,
  ): Promise<SongGenerationSubmission> {
    const routing = await this.routingGate.getGenerationRouting(this.campaignId);
    const primary = this.providerRegistry.get(routing.primaryProvider);

    logger.info("generation_provider_selected", {
      songId: song.id,
      provider: primary.name,
      providerModel: primary.model,
      primary: routing.primaryProvider,
      fallback: routing.fallbackProvider,
    });

    song.assignProvider(primary.name, primary.model);

    try {
      return await primary.submitGeneration(input);
    } catch (error) {
      const canFallBack = routing.fallbackProvider !== null && isFallbackEligible(error);

      if (!canFallBack) {
        throw error;
      }

      const fallback = this.providerRegistry.get(routing.fallbackProvider as string);

      logger.error("generation_fallback", {
        songId: song.id,
        primary: primary.name,
        fallback: fallback.name,
        selected: fallback.name,
        reason: providerErrorCode(error),
      });

      song.assignProvider(fallback.name, fallback.model);

      return await fallback.submitGeneration(input);
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
