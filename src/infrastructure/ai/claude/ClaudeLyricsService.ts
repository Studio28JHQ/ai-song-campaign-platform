import { ClaudeClient } from "./ClaudeClient";
import { PromptBuilder, type PromptBuilderInput } from "./PromptBuilder";
import { ResponseParser } from "./ResponseParser";
import type { ClaudeLyricsResult } from "./types";

/**
 * Single-request moderation + lyrics generation. Exactly one Claude call
 * per invocation: that one request both moderates the parent's message
 * and, when approved, generates the lyrics — see PromptBuilder for the
 * prompt that makes this possible.
 *
 * This class is infrastructure-only. It is not wired into any Application
 * use case yet — that wiring, along with a matching application-layer
 * port/contract, is a future task.
 */
export class ClaudeLyricsService {
  constructor(private readonly client: ClaudeClient = new ClaudeClient()) {}

  async generateAndModerate(input: PromptBuilderInput): Promise<ClaudeLyricsResult> {
    const prompt = PromptBuilder.build(input);
    const response = await this.client.sendMessage(prompt);
    return ResponseParser.parse(response);
  }
}
