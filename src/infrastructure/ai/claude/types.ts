import type { ModerationCategory } from "./moderationCategories";

/** A single content block from Anthropic's Messages API response. */
export interface ClaudeContentBlock {
  type: string;
  text?: string;
}

/** The subset of Anthropic's Messages API response shape this integration cares about. */
export interface ClaudeMessageResponse {
  content: ClaudeContentBlock[];
  /** Optional here only for lenient typing against a possibly-malformed body — see `ClaudeClient`'s integrity check. */
  stop_reason?: string | null;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: {
      thinking_tokens?: number;
    };
  };
}

/**
 * The structured result our prompt requests — see `PromptBuilder`.
 *
 * This is the **public** shape: what leaves `ClaudeLyricsService` and
 * reaches the application layer. It deliberately has no
 * `moderationCategory` — see `ClaudeModeratedResult`.
 */
export interface ClaudeLyricsResult {
  approved: boolean;
  reason: string | null;
  lyrics: string | null;
  /** Sprint v1.1 — AI Musical Direction. `null` whenever `lyrics` is. */
  musicMood: string | null;
  musicDirection: string | null;
}

/**
 * Sprint FINAL-4 — Targeted Lyrics Repair. The **internal** result, as
 * `ResponseParser` produces it: everything above plus the moderation
 * category that steers a repair.
 *
 * The category never leaves `ClaudeLyricsService` — the service returns
 * a plain `ClaudeLyricsResult`, so there is no path by which it could
 * reach a DTO, an HTTP response or the UI. That separation is a type,
 * not a convention.
 */
export interface ClaudeModeratedResult extends ClaudeLyricsResult {
  moderationCategory: ModerationCategory | null;
}
