import type { SunoRequestPayload } from "./types";

export interface SunoPromptInput {
  lyrics: string;
  moodName: string;
  sunoPrompt: string;
}

/**
 * Builds the request payload sent to Suno from an already-approved
 * Lyrics version and its Mood's fixed prompt. Never regenerates or
 * otherwise alters the lyrics text — it is passed through exactly as
 * approved (see docs/Product/Business_Rules.md — Song Rules).
 */
export class PromptBuilder {
  static build(input: SunoPromptInput): SunoRequestPayload {
    return {
      prompt: input.sunoPrompt,
      lyrics: input.lyrics,
      tags: input.moodName,
      title: PromptBuilder.extractTitle(input.lyrics),
    };
  }

  private static extractTitle(lyrics: string): string {
    const [firstLine] = lyrics.split("\n");
    return firstLine?.trim() || "Untitled";
  }
}
