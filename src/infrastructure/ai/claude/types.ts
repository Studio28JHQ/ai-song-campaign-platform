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

/** The structured result our prompt requests — see `PromptBuilder`. */
export interface ClaudeLyricsResult {
  approved: boolean;
  reason: string | null;
  lyrics: string | null;
  /** Sprint v1.1 — AI Musical Direction. `null` whenever `lyrics` is. */
  musicMood: string | null;
  musicDirection: string | null;
}
