import { PromptBuilder, type SunoPromptInput } from "./PromptBuilder";
import { ResponseParser } from "./ResponseParser";
import { SunoClient } from "./SunoClient";
import type { SunoApiResult } from "./types";

/**
 * Generates exactly one song per call — never multiple variations (see
 * docs/Product/Business_Rules.md — Song Rules). Uses the approved lyrics
 * exactly as given; this class never regenerates or edits them.
 */
export class SunoSongService {
  constructor(private readonly client: SunoClient = new SunoClient()) {}

  async generateSong(input: SunoPromptInput): Promise<SunoApiResult> {
    const payload = PromptBuilder.build(input);
    const raw = await this.client.generate(payload);
    return ResponseParser.parse(raw);
  }
}
