import { ExternalApiError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import { ClaudeClient } from "./ClaudeClient";
import { PromptBuilder, type PromptBuilderInput } from "./PromptBuilder";
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
 * This class is infrastructure-only. It is not wired into any Application
 * use case yet — that wiring, along with a matching application-layer
 * port/contract, is a future task.
 */
export class ClaudeLyricsService {
  constructor(private readonly client: ClaudeClient = new ClaudeClient()) {}

  async generateAndModerate(input: PromptBuilderInput): Promise<ClaudeLyricsResult> {
    const prompt = PromptBuilder.build(input);

    for (let attempt = 1; ; attempt += 1) {
      const response = await this.client.sendMessage(prompt);

      try {
        return ResponseParser.parse(response);
      } catch (error) {
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
      }
    }
  }
}
