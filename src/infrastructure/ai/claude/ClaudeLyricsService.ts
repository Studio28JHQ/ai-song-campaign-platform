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
import { type ModerationCategory, PUBLIC_MODERATION_REASON } from "./moderationCategories";
import { type ClaudePrompt, type LyricsDraft, PromptBuilder } from "./PromptBuilder";
import { ResponseParser } from "./ResponseParser";
import type { ClaudeLyricsResult, ClaudeMessageResponse, ClaudeModeratedResult } from "./types";

/**
 * Sprint FINAL-4 — Targeted Lyrics Repair. The **only** call budget:
 * every Claude call a single lyrics request may spend, whatever it is
 * spent on — the first generation, a length repair, or a moderation
 * repair. There is deliberately one counter and not one per kind, so the
 * kinds can never multiply into "3 generations plus 3 repairs".
 *
 * Three is the same ceiling this service already had (one generation
 * plus the two blind retries it used to allow), so the worst-case cost
 * per request is unchanged. What changed is that the calls after the
 * first are now aimed at the specific problem, instead of repeating the
 * same prompt and hoping for a different answer.
 */
const MAX_CLAUDE_CALLS_PER_REQUEST = 3;

/**
 * Sprint FINAL-8 — Lyrics Length Control. What a given call in the budget
 * was spent on, so the metrics line below can distinguish "the first
 * generation came back at 412" from "the repair of a 412 came back at
 * 388" — the difference between a prompt that overshoots and a repair
 * that converges too slowly, which the attempt rows alone cannot tell
 * apart.
 */
type ClaudeCallKind = "generation" | "length_repair" | "moderation_repair";

/**
 * Sprint FINAL-8 — Lyrics Length Control. One structured line per real
 * Claude call, carrying only sizes and outcomes.
 *
 * Why a log line and not a column. The one thing the 2026-09-30 audit
 * could not answer from the database was what a *successful* call
 * produced and how big its inputs were: `GenerationAttempt` records the
 * over-long lengths (they are quoted in the failure message this codebase
 * writes) but nothing about an approval, and a lead whose every call
 * failed leaves no `lyrics` row and therefore no trace of the story it
 * was given. Closing that gap in the table means a migration for four
 * numbers on a campaign with weeks left to run; these fields answer the
 * same questions at zero schema cost. `GenerationAttempt` keeps recording
 * what it already records — the ordinal, the outcome, the error code, and
 * the timestamps a duration comes from — and this adds the sizes next to
 * it. See docs/Architecture/External_Services.md for what a column would
 * involve if the campaign ever wants these joinable.
 *
 * Every field is a number, a small enum, or an error code. No lyric, no
 * prompt, no parent message, and no fragment of any of them is ever
 * written here — the same rule `toLyricsAttemptFailureReason` already
 * applies to the database.
 */
interface ClaudeCallMetrics {
  leadId: string;
  call: number;
  maxCalls: number;
  kind: ClaudeCallKind;
  /** Characters in the parent's story, as it reached the prompt. */
  parentMessageLength: number;
  /** Characters in the assembled prompt (system + user). */
  promptLength: number;
  /** Characters in the lyric Claude returned; `null` when it returned none. */
  outputLength: number | null;
  durationMs: number;
  result: "SUCCESS" | "MODERATION_REJECTED" | "FAILED";
  errorCode: string | null;
}

/**
 * Moderation + lyrics generation for one request, with a bounded budget
 * of Claude calls and two kinds of targeted repair.
 *
 * The first call moderates the parent's message and, when it passes,
 * generates the lyrics (see `PromptBuilder` for the prompt that makes
 * that possible in one call). What happens next depends on what came
 * back, and every branch draws from the same
 * `MAX_CLAUDE_CALLS_PER_REQUEST` budget:
 *
 * - **Lyrics over the hard maximum** (`claude.lyrics_too_long`) — the
 *   draft Claude just produced is still in memory here, inside the raw
 *   response, so the next call asks Claude to *edit that draft* down
 *   into the target window rather than write a new song from scratch. A
 *   repair that is still too long is repaired again, always from the
 *   most recent draft, never back to the original. Measured in
 *   production on 2026-09-30 over 848 recorded calls: 377 (48.6%)
 *   overshot the 360-character maximum, averaging 418 characters — which
 *   a blind retry only ever fixed by luck.
 * - **Moderation rejection** — Claude names the rule it applied
 *   (`moderationCategory`, internal). Exactly one directed call then
 *   asks for the same song with that element left out. That call
 *   re-applies the full safety rules and may reject again, which ends
 *   the request: there is never a second moderation repair.
 * - **Anything else** — unchanged. A malformed response, a rate limit,
 *   an outage: thrown exactly as before, with no repair attempted.
 *
 * ## The cost this class bounds, and the cost it does not
 *
 * One request spends at most `MAX_CLAUDE_CALLS_PER_REQUEST` calls. That
 * is the only ceiling here, and it is deliberately not a ceiling per
 * lead: a request that exhausts the budget on over-long lyrics throws,
 * and `GenerateLyricsForLeadUseCase` consumes the parent's functional
 * attempt only *after* this service returns — so an internal failure
 * costs the parent nothing and they can ask again, spending up to three
 * more calls, without limit. Sprint FINAL-8 audited that path and left it
 * alone on purpose: every bound that could be placed on it (a lifetime
 * call cap per lead, charging a functional attempt for a length failure)
 * penalises a parent for a defect on our side, and the campaign has no
 * rule saying how many of our own failures a family should absorb. The
 * fix applied instead was to stop generating over-long lyrics — see
 * `PromptBuilder`'s target window. The residual risk is real and is
 * written down in docs/Architecture/External_Services.md; the metrics
 * line below is what will show whether it is still worth acting on.
 *
 * Three boundaries this class keeps:
 *
 * 1. **`ResponseParser` remains the only authority on length.** Nothing
 *    here re-checks 360; a repair is validated by exactly the same
 *    parser, through exactly the same contract, as a first generation.
 * 2. **The parent's attempts are untouched.** This service has no lead
 *    and no repository — `GenerateLyricsForLeadUseCase` owns
 *    `consumeAttempt()` and cannot see any of these calls, so a repair,
 *    successful or not, can never cost a parent an attempt.
 * 3. **The moderation category never leaves.** It steers the repair
 *    prompt and is recorded for the campaign team; what the parent gets
 *    is always `PUBLIC_MODERATION_REASON`, set here in code rather than
 *    trusted to the model.
 *
 * Attempt recording (Sprint FINAL-2) is unchanged and still covers every
 * call, repairs included — they are real Claude calls. It remains
 * strictly best-effort: a broken recorder produces a log line and
 * nothing else, and never changes what the parent gets.
 */
export class ClaudeLyricsService {
  constructor(
    private readonly client: ClaudeClient = new ClaudeClient(),
    private readonly attemptRecorder: LyricsAttemptRecorder = NO_OP_LYRICS_ATTEMPT_RECORDER,
  ) {}

  async generateAndModerate(input: LyricsGeneratorInput): Promise<ClaudeLyricsResult> {
    // The prompt for the *next* call. It starts as a plain generation and
    // is replaced by a repair prompt whenever the previous call gave us
    // something specific to fix.
    let prompt: ClaudePrompt = PromptBuilder.build(input);
    let kind: ClaudeCallKind = "generation";

    // One directed moderation repair per request, ever.
    let moderationRepairSpent = false;

    for (let call = 1; call <= MAX_CLAUDE_CALLS_PER_REQUEST; call += 1) {
      const isLastCall = call === MAX_CLAUDE_CALLS_PER_REQUEST;
      const handle = await this.openAttempt(input.leadId);

      // Captured before the call: the sizes that went in. `promptLength`
      // is the whole assembled prompt, which is what an input-cost
      // question is actually about.
      const measured = {
        leadId: input.leadId,
        call,
        maxCalls: MAX_CLAUDE_CALLS_PER_REQUEST,
        kind,
        parentMessageLength: input.parentMessage.length,
        promptLength: prompt.system.length + prompt.user.length,
      };
      const startedAt = Date.now();

      let response: ClaudeMessageResponse;
      try {
        response = await this.client.sendMessage(prompt);
      } catch (error) {
        const outcome = ClaudeLyricsService.failureOf(error);
        ClaudeLyricsService.recordCall({
          ...measured,
          outputLength: null,
          durationMs: Date.now() - startedAt,
          result: outcome.result,
          errorCode: outcome.errorCode,
        });
        await this.closeAttempt(handle, outcome);
        throw error;
      }

      const durationMs = Date.now() - startedAt;

      let result: ClaudeModeratedResult;
      try {
        result = ResponseParser.parse(response);
      } catch (error) {
        const outcome = ClaudeLyricsService.failureOf(error);
        ClaudeLyricsService.recordCall({
          ...measured,
          // For a too-long rejection the parser puts the measured length
          // in the error's context; for every other parse failure there
          // is no lyric to have measured.
          outputLength: ClaudeLyricsService.rejectedLyricsLength(error),
          durationMs,
          result: outcome.result,
          errorCode: outcome.errorCode,
        });
        await this.closeAttempt(handle, outcome);

        const isLyricsTooLong =
          error instanceof ExternalApiError && error.code === "claude.lyrics_too_long";

        if (!isLyricsTooLong || isLastCall) {
          throw error;
        }

        // The draft that was just rejected for length is still here, in
        // the raw response. Repairing it is the whole point; if it cannot
        // be read back for any reason, fall back to the blind retry this
        // service did before, rather than failing the request.
        const draft = ClaudeLyricsService.extractDraft(response);
        prompt = draft ? PromptBuilder.buildLengthRepair(input, draft) : PromptBuilder.build(input);
        kind = draft ? "length_repair" : "generation";

        logger.warn("Claude lyrics exceeded the hard maximum; repairing the draft", {
          call,
          maxCalls: MAX_CLAUDE_CALLS_PER_REQUEST,
          repairing: draft !== null,
          ...(error.context ?? {}),
        });

        continue;
      }

      if (result.approved) {
        ClaudeLyricsService.recordCall({
          ...measured,
          outputLength: result.lyrics?.length ?? null,
          durationMs,
          result: "SUCCESS",
          errorCode: null,
        });
        await this.closeAttempt(handle, {
          result: "SUCCESS",
          errorCode: null,
          failureReason: null,
        });

        return ClaudeLyricsService.toPublicResult(result);
      }

      // A moderation rejection: a completed call with a legitimate
      // answer, not a failure. It carries no error code — what it carries
      // is the category, which is recorded (for the campaign team) and
      // used to steer one repair (for the parent).
      //
      // `null` means the model named no rule we recognise: absent,
      // misspelled, or something outside the vocabulary. That is not the
      // same as the explicit `OTHER_UNSAFE_CONTENT`, which is a real rule
      // and is repaired like any other. With nothing to aim at, a repair
      // would be a paid call asking Claude to remove something neither of
      // us can name, so the request ends here instead — the parent still
      // gets the same message, and the raw wording is still recorded.
      const category = result.moderationCategory;
      ClaudeLyricsService.recordCall({
        ...measured,
        outputLength: null,
        durationMs,
        result: "MODERATION_REJECTED",
        errorCode: null,
      });
      await this.closeAttempt(handle, {
        result: "MODERATION_REJECTED",
        errorCode: null,
        failureReason: ClaudeLyricsService.moderationTrace(category, result.reason),
      });

      if (moderationRepairSpent || isLastCall || category === null) {
        return ClaudeLyricsService.publicRejection();
      }

      moderationRepairSpent = true;
      prompt = PromptBuilder.buildModerationRepair(input, category);
      kind = "moderation_repair";

      logger.warn("Claude rejected the parent's message; attempting one directed repair", {
        call,
        maxCalls: MAX_CLAUDE_CALLS_PER_REQUEST,
        moderationCategory: category,
      });
    }

    // Unreachable: every iteration either returns, throws, or is not the
    // last one. Kept so the budget can never be widened by accident
    // without someone having to decide what happens here.
    throw new ExternalApiError("Claude lyrics generation exhausted its call budget.", {
      code: "claude.call_budget_exhausted",
      context: { maxCalls: MAX_CLAUDE_CALLS_PER_REQUEST },
    });
  }

  /**
   * Sprint FINAL-8 — Lyrics Length Control. Emits the metrics line for
   * one finished Claude call.
   *
   * `info`, not `warn`: this fires on every call including the successful
   * ones, and the distribution is only readable if the successes are in
   * it too — the whole point is being able to ask "where is output length
   * landing now?" rather than only "which ones failed?". The existing
   * `warn` lines for a repair and a rejection are unchanged and still say
   * what they always said.
   *
   * Never throws and never affects the generation: an observability
   * failure must not cost a parent a song. `logger` writes to the console
   * and cannot realistically fail, but the guarantee is made here rather
   * than assumed.
   */
  private static recordCall(metrics: ClaudeCallMetrics): void {
    try {
      logger.info("claude.lyrics_call", { ...metrics });
    } catch {
      // Intentionally empty — see above.
    }
  }

  /**
   * The lyric length a `claude.lyrics_too_long` rejection measured, read
   * from the error's own context rather than from the response, so this
   * and the parser can never disagree about what was counted. `null` for
   * every other failure: nothing was measured, and a zero would read as
   * "Claude returned an empty lyric", which is a different event.
   */
  private static rejectedLyricsLength(error: unknown): number | null {
    if (!(error instanceof ExternalApiError) || error.code !== "claude.lyrics_too_long") {
      return null;
    }

    const length = error.context?.lyricsLength;
    return typeof length === "number" ? length : null;
  }

  /**
   * Reads the draft Claude just produced back out of its own raw
   * response, so a length repair can edit it.
   *
   * Deliberately lenient and deliberately silent on failure: this runs
   * on a response the parser has *already* rejected, so it must not be
   * the thing that turns a recoverable overshoot into an error. A `null`
   * simply means "nothing to repair", and the caller retries blindly
   * instead — the behaviour this service had before repairs existed.
   *
   * Nothing read here is persisted. The draft lives in memory for the
   * rest of the request and is then gone, which is the privacy decision
   * the rest of this integration already makes (see
   * `toLyricsAttemptFailureReason`).
   */
  private static extractDraft(response: ClaudeMessageResponse): LyricsDraft | null {
    try {
      const text = response.content?.find(
        (block) => block.type === "text" && typeof block.text === "string",
      )?.text;

      if (typeof text !== "string") return null;

      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null) return null;

      const record = parsed as {
        lyrics?: unknown;
        musicMood?: unknown;
        musicDirection?: unknown;
      };

      if (typeof record.lyrics !== "string" || record.lyrics.trim().length === 0) {
        return null;
      }

      return {
        lyrics: record.lyrics,
        musicMood: typeof record.musicMood === "string" ? record.musicMood : null,
        musicDirection: typeof record.musicDirection === "string" ? record.musicDirection : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * What gets recorded for a moderation rejection: the internal category
   * first, so the campaign team can finally group these (before this,
   * 21 rejections in one day produced 20 different free-text strings),
   * followed by Claude's own wording for context.
   *
   * Claude's `reason` is safe to store — the prompt forbids it from
   * repeating, quoting or describing the content it rejected — and the
   * parent's own message is never written here.
   */
  private static moderationTrace(
    category: ModerationCategory | null,
    reason: string | null,
  ): string {
    const detail = reason?.trim();
    const prefix = category ?? "UNCATEGORISED";
    return (detail ? `${prefix} — ${detail}` : prefix).slice(0, 300);
  }

  /**
   * The rejection the parent receives. Always the application's own
   * generic Spanish message, never the model's: the guarantee that no
   * category, policy wording or description of the rejected content can
   * reach the UI is made here, in code, not by asking the model nicely.
   */
  private static publicRejection(): ClaudeLyricsResult {
    return {
      approved: false,
      reason: PUBLIC_MODERATION_REASON,
      lyrics: null,
      musicMood: null,
      musicDirection: null,
    };
  }

  /**
   * Narrows the internal result to the public one. `moderationCategory`
   * is dropped by construction here — there is no path from this method's
   * return value to a DTO, an HTTP response or the UI that could carry
   * it.
   */
  private static toPublicResult(result: ClaudeModeratedResult): ClaudeLyricsResult {
    return {
      approved: result.approved,
      reason: result.reason,
      lyrics: result.lyrics,
      musicMood: result.musicMood,
      musicDirection: result.musicDirection,
    };
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
