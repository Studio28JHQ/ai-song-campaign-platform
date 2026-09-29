import type {
  LyricsAttemptFinish,
  LyricsAttemptHandle,
  LyricsAttemptRecorder,
} from "@/application/lyrics/contracts/LyricsAttemptRecorder";
import { NO_OP_LYRICS_ATTEMPT_RECORDER } from "@/application/lyrics/contracts/LyricsAttemptRecorder";
import type { LyricsGeneratorInput } from "@/application/lyrics/contracts/LyricsGenerator";
import { ExternalApiError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import { CLAUDE_MODEL, ClaudeClient } from "./ClaudeClient";
import { toLyricsAttemptErrorCode, toLyricsAttemptFailureReason } from "./lyricsAttemptErrorCode";
import { PromptBuilder } from "./PromptBuilder";
import { ResponseParser } from "./ResponseParser";
import type { ClaudeLyricsResult } from "./types";

/**
 * How many extra attempts are allowed, on top of the first, specifically
 * when — and only when — the lyrics alone came back over the 360-character
 * hard maximum (see `ResponseParser`'s `claude.lyrics_too_long` code).
 * Every other rejection (missing fields, out-of-bounds musicMood/
 * musicDirection, invalid JSON, an unparseable response) is never
 * retried here — a fresh generation wouldn't fix any of those the way it
 * plausibly fixes an isolated length overshoot. This stays deliberately
 * small so a length overshoot can never turn into a long chain of paid
 * API calls for what is normally a rare, single-attempt overshoot.
 *
 * Raised from 1 to 2 after a live re-measurement of the current prompt
 * put the single-call overshoot rate at roughly 1 in 8 (one 454-character
 * lyric in 8 consecutive generations) rather than the ~2 in 21 observed
 * when this constant was introduced. At that rate a single retry still
 * surfaces `claude_unavailable` to the parent on roughly 1.5% of
 * generations; a second one takes that to roughly 0.2%, for a worst case
 * of 3 Claude calls — still bounded, and still only ever spent on the one
 * failure mode a fresh generation actually fixes.
 */
const LYRICS_TOO_LONG_RETRY_LIMIT = 2;

/**
 * Single-request moderation + lyrics generation, with one narrow
 * exception: exactly one Claude call per invocation moderates the
 * parent's message and, when approved, generates the lyrics (see
 * `PromptBuilder` for the prompt that makes this possible) — unless the
 * lyrics alone come back over the 360-character hard maximum, in which
 * case this retries, up to `LYRICS_TOO_LONG_RETRY_LIMIT` extra times,
 * calling Claude again with the exact same prompt. `PromptBuilder.build`
 * is a pure function of `input` — reusing the same prompt does not ask
 * Claude to mechanically shorten its previous answer (it never sees
 * that answer); it asks the same question again, and lets Claude's own
 * generation produce a genuinely new complete lyric, which the same
 * prompt already instructs to normally land around 300–330 characters.
 *
 * ## Traceability (Sprint FINAL-2)
 *
 * Every one of those calls — including the internal retries, which no
 * other layer can see — is recorded through `LyricsAttemptRecorder`:
 * opened as `STARTED` before the call, closed with `SUCCESS`,
 * `MODERATION_REJECTED` or `FAILED` (plus a normalised `errorCode`) once
 * the outcome is known. That is why the recorder is injected *here* and
 * not into the use case: the use case sees one result or one thrown
 * error, so recording there would miss exactly the retried failures this
 * tracing exists to explain.
 *
 * Recording is strictly observational and strictly best-effort. Every
 * recorder call is wrapped: a recorder that throws, or a database that is
 * unreachable, produces a log line and nothing else. A successful
 * generation must never become a user-facing error because its audit row
 * could not be written, and no recording failure changes what is
 * returned, retried or thrown.
 */
export class ClaudeLyricsService {
  constructor(
    private readonly client: ClaudeClient = new ClaudeClient(),
    private readonly attemptRecorder: LyricsAttemptRecorder = NO_OP_LYRICS_ATTEMPT_RECORDER,
  ) {}

  async generateAndModerate(input: LyricsGeneratorInput): Promise<ClaudeLyricsResult> {
    const prompt = PromptBuilder.build(input);

    // `attempt` counts real Claude calls within this invocation, and is what
    // the recorder's per-lead `attemptNumber` continues across invocations.
    // It is unrelated to `Lead.remainingAttempts`, the parent's functional
    // attempts, which this loop never touches: an over-long lyric retried
    // here costs the parent nothing (see `LyricsAttemptRecorder`).
    for (let attempt = 1; ; attempt += 1) {
      const handle = await this.openAttempt(input.leadId);

      let response;
      try {
        response = await this.client.sendMessage(prompt);
      } catch (error) {
        await this.closeAttempt(handle, ClaudeLyricsService.failureOf(error));
        throw error;
      }

      let result: ClaudeLyricsResult;
      try {
        result = ResponseParser.parse(response);
      } catch (error) {
        await this.closeAttempt(handle, ClaudeLyricsService.failureOf(error));

        const isLyricsTooLong =
          error instanceof ExternalApiError && error.code === "claude.lyrics_too_long";

        if (!isLyricsTooLong || attempt > LYRICS_TOO_LONG_RETRY_LIMIT) {
          throw error;
        }

        logger.warn("Claude lyrics exceeded the 360-character maximum; retrying generation", {
          attempt,
          retryLimit: LYRICS_TOO_LONG_RETRY_LIMIT,
          ...(error.context ?? {}),
        });

        continue;
      }

      // A moderation rejection is a completed call with a legitimate answer,
      // not a failure: it carries no `errorCode`.
      await this.closeAttempt(handle, {
        result: result.approved ? "SUCCESS" : "MODERATION_REJECTED",
        errorCode: null,
        failureReason: result.approved ? null : (result.reason?.slice(0, 300) ?? null),
      });

      return result;
    }
  }

  private static failureOf(error: unknown): LyricsAttemptFinish {
    return {
      result: "FAILED",
      errorCode: toLyricsAttemptErrorCode(error),
      failureReason: toLyricsAttemptFailureReason(error),
    };
  }

  /**
   * Opens the attempt row. Returns `null` when it could not be written —
   * the generation then proceeds completely unchanged, simply untraced.
   */
  private async openAttempt(leadId: string): Promise<LyricsAttemptHandle | null> {
    try {
      return await this.attemptRecorder.attemptStarted({
        leadId,
        providerModel: CLAUDE_MODEL,
      });
    } catch (error) {
      logger.warn("Could not record the start of a lyrics generation attempt", {
        leadId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async closeAttempt(
    handle: LyricsAttemptHandle | null,
    outcome: LyricsAttemptFinish,
  ): Promise<void> {
    if (!handle) return;

    try {
      await this.attemptRecorder.attemptFinished(handle, outcome);
    } catch (error) {
      // The row stays `STARTED` with a null `completedAt`. That is a
      // recognised state, not corruption — see `GenerationAttemptResult`.
      logger.warn("Could not record the outcome of a lyrics generation attempt", {
        result: outcome.result,
        errorCode: outcome.errorCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
