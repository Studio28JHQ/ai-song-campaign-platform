import type { SongGenerationInput } from "@/application/song/contracts/SongGenerationProvider";
import type { Voice } from "@/domain/lyrics/types";
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

/** Sprint v1.1 — AI Musical Direction. English, matching the rest of the prompt's language. */
const VOICE_LABEL: Record<Voice, string> = {
  FEMALE: "Female voice",
  MALE: "Male voice",
};

/**
 * Builds the request payload sent to Mureka from `GenerationDispatcher`'s
 * `SongGenerationInput`. Sprint v1.1 — AI Musical Direction: `prompt` is
 * no longer the Mood's fixed `sunoPrompt` — it is composed from the
 * approved Lyrics version's own AI-generated musical direction (Claude
 * is responsible for all creative decisions; Mureka only composes the
 * music from them). `lyrics` is still passed through exactly as
 * approved, never regenerated or otherwise altered — both as its own
 * top-level field (Mureka's actual structural field) and, unchanged,
 * inside the composed `prompt` text.
 */
export class PromptBuilder {
  static build(input: SongGenerationInput): MurekaGenerateRequest {
    const prompt = [
      "Create an original children's song.",
      "",
      "Mood:",
      input.musicMood,
      "",
      "Baby Context:",
      input.parentMessage,
      "",
      "Musical Direction:",
      input.musicDirection,
      "",
      "Lyrics:",
      input.lyrics,
      "",
      "Voice:",
      VOICE_LABEL[input.voice],
    ].join("\n");

    return {
      lyrics: input.lyrics,
      model: MUREKA_MODEL,
      prompt,
      n: MUREKA_SONG_COUNT,
    };
  }
}
