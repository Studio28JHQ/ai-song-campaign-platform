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
 *   production on 2026-09-29: 41.6% of calls overshot the 360-character
 *   maximum, with a median overshoot to 406 — which a blind retry only
 *   ever fixed by luck.
 * - **Moderation rejection** — Claude names the rule it applied
 *   (`moderationCategory`, internal). Exactly one directed call then
 *   asks for the same song with that element left out. That call
 *   re-applies the full safety rules and may reject again, which ends
 *   the request: there is never a second moderation repair.
 * - **Anything else** — unchanged. A malformed response, a rate limit,
 *   an outage: thrown exactly as before, with no repair attempted.
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

    // One directed moderation repair per request, ever.
    let moderationRepairSpent = false;

    for (let call = 1; call <= MAX_CLAUDE_CALLS_PER_REQUEST; call += 1) {
      const isLastCall = call === MAX_CLAUDE_CALLS_PER_REQUEST;
      const handle = await this.openAttempt(input.leadId);

      let response: ClaudeMessageResponse;
      try {
        response = await this.client.sendMessage(prompt);
      } catch (error) {
        await this.closeAttempt(handle, ClaudeLyricsService.failureOf(error));
        throw error;
      }

      let result: ClaudeModeratedResult;
      try {
        result = ResponseParser.parse(response);
      } catch (error) {
        await this.closeAttempt(handle, ClaudeLyricsService.failureOf(error));

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

        logger.warn("Claude lyrics exceeded the 360-character maximum; repairing the draft", {
          call,
          maxCalls: MAX_CLAUDE_CALLS_PER_REQUEST,
          repairing: draft !== null,
          ...(error.context ?? {}),
        });

        continue;
      }

      if (result.approved) {
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
