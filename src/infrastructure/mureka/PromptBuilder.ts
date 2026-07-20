import type { SongGenerationInput } from "@/application/song/contracts/SongGenerationProvider";
import type { Voice } from "@/domain/lyrics/types";
import type { MurekaGender, MurekaGenerateRequest } from "./types";

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

/** This pipeline never streams playback — Mureka generates the full song asynchronously, polled to completion (see `GenerationPoller`). */
const MUREKA_STREAM = false;

/**
 * Translates the domain `Voice` ("MALE"/"FEMALE") into Mureka's own
 * `gender` field — the only place this translation happens; the
 * Mureka-specific lowercase values never cross out of this adapter.
 */
const GENDER_MAP: Record<Voice, MurekaGender> = {
  FEMALE: "female",
  MALE: "male",
};

/**
 * Builds the request payload sent to Mureka from `GenerationDispatcher`'s
 * `SongGenerationInput`. Sprint v1.1 — AI Musical Direction: `prompt` is
 * no longer the Mood's fixed `sunoPrompt` — it is composed from the
 * approved Lyrics version's own AI-generated musical direction (Claude
 * is responsible for all creative decisions; Mureka only composes the
 * music from them). `lyrics` is passed through exactly as approved,
 * never regenerated or otherwise altered, as its own top-level field —
 * Mureka's actual structural field for the song text.
 *
 * `prompt` deliberately does NOT also embed `lyrics` — live-verified
 * against the real Mureka API: `prompt` has an undocumented (not shown
 * in Mureka's own quickstart/reference examples) hard limit of 1024
 * characters, and every production submission's `prompt` exceeded it by
 * duplicating the full song lyrics inside it on top of the dedicated
 * `lyrics` field, which Mureka rejected with `HTTP 400` /
 * "The prompt exceeds 1024 characters." `prompt` now carries only
 * creative direction (mood and musical direction) — comfortably within
 * the limit regardless of song length. The narrator voice is no longer
 * described in `prompt` either, now that Mureka's official contract has
 * a dedicated `gender` field for it — describing it in both places
 * would be redundant.
 *
 * Sprint v1.2 — AI Safety Hardening: the parent's raw message never
 * reaches this class — `SongGenerationInput` has no `parentMessage`
 * field at all (see its own doc comment). Mureka receives only
 * Claude's already-moderated creative output (`musicMood`,
 * `musicDirection`, `lyrics`) and the fixed `voice` selection (as
 * `gender`); it is never responsible for moderation itself.
 */
export class PromptBuilder {
  static build(input: SongGenerationInput): MurekaGenerateRequest {
    const prompt = [
      "Create an original children's song.",
      "",
      "Mood:",
      input.musicMood,
      "",
      "Musical Direction:",
      input.musicDirection,
    ].join("\n");

    return {
      lyrics: input.lyrics,
      prompt,
      model: MUREKA_MODEL,
      n: MUREKA_SONG_COUNT,
      gender: GENDER_MAP[input.voice],
      stream: MUREKA_STREAM,
    };
  }
}
