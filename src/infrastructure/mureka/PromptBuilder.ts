import type { SongGenerationInput } from "@/application/song/contracts/SongGenerationProvider";
import type { MurekaGenerateRequest } from "./types";

/**
 * Mureka's official docs show `"model": "auto"` in their quickstart
 * example — letting Mureka pick the current generation model rather
 * than pinning a specific version, the same "don't hardcode a moving
 * target" reasoning `ClaudeClient` applies to its own model constant.
 * Reference: https://platform.mureka.ai/docs/en/quickstart.html
 */
const MUREKA_MODEL = "auto";

/** Exactly one song is ever generated per call (see docs/Product/Business_Rules.md — Song Rules). */
const MUREKA_SONG_COUNT = 1;

/**
 * Builds the request payload sent to Mureka from `GenerationDispatcher`'s
 * `SongGenerationInput` (already-approved lyrics text and the Mood's
 * fixed prompt). Never regenerates or otherwise alters the lyrics text;
 * it is passed through exactly as approved.
 */
export class PromptBuilder {
  static build(input: SongGenerationInput): MurekaGenerateRequest {
    return {
      lyrics: input.lyrics,
      model: MUREKA_MODEL,
      prompt: input.sunoPrompt,
      n: MUREKA_SONG_COUNT,
    };
  }
}
