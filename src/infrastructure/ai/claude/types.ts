/** A single content block from Anthropic's Messages API response. */
export interface ClaudeContentBlock {
  type: string;
  text?: string;
}

/** The subset of Anthropic's Messages API response shape this integration cares about. */
export interface ClaudeMessageResponse {
  content: ClaudeContentBlock[];
}

/** The structured result our prompt requests — see `PromptBuilder`. */
export interface ClaudeLyricsResult {
  approved: boolean;
  reason: string | null;
  lyrics: string | null;
}
