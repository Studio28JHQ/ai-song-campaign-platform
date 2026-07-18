import { z } from "zod";
import { ExternalApiError } from "@/shared/errors";
import type { ClaudeContentBlock, ClaudeLyricsResult, ClaudeMessageResponse } from "./types";

// Sprint v1.2 — AI Safety Hardening. Bounds Claude's own creative-direction
// output before it is ever persisted or embedded in the Mureka prompt —
// on top of the non-emptiness check already enforced, so a malformed or
// abnormally long/short response is rejected here rather than reaching
// storage or the music provider. "A few words" / "one short sentence"
// (see `PromptBuilder`'s instructions) are comfortably inside these
// bounds; a value outside them is treated exactly like any other
// schema mismatch — `claude.malformed_response`, never persisted.
const MUSIC_MOOD_MIN_LENGTH = 5;
const MUSIC_MOOD_MAX_LENGTH = 150;
const MUSIC_DIRECTION_MIN_LENGTH = 15;
const MUSIC_DIRECTION_MAX_LENGTH = 400;

const claudeLyricsResponseSchema = z
  .object({
    approved: z.boolean(),
    reason: z.string().nullable(),
    lyrics: z.string().nullable(),
    // Sprint v1.1 — AI Musical Direction. Sprint v1.2 — length-bounded, see above.
    musicMood: z.string().nullable(),
    musicDirection: z.string().nullable(),
  })
  .refine(
    (value) => {
      if (!value.approved) {
        return typeof value.reason === "string" && value.reason.trim().length > 0;
      }

      const lyricsOk = typeof value.lyrics === "string" && value.lyrics.trim().length > 0;

      const moodOk =
        typeof value.musicMood === "string" &&
        value.musicMood.trim().length >= MUSIC_MOOD_MIN_LENGTH &&
        value.musicMood.trim().length <= MUSIC_MOOD_MAX_LENGTH;

      const directionOk =
        typeof value.musicDirection === "string" &&
        value.musicDirection.trim().length >= MUSIC_DIRECTION_MIN_LENGTH &&
        value.musicDirection.trim().length <= MUSIC_DIRECTION_MAX_LENGTH;

      return lyricsOk && moodOk && directionOk;
    },
    {
      message:
        "an approved response requires non-empty lyrics and a musicMood/musicDirection within their configured length bounds; a rejected response requires a non-empty reason.",
    },
  );

/**
 * Parses and validates Claude's Messages API response into the structured
 * moderation + lyrics result our prompt requests (see `PromptBuilder`).
 * Throws the shared `ExternalApiError` for any malformed or unexpected
 * shape — no raw Claude payload or parsing exception ever escapes this
 * class (see docs/Architecture/External_Services.md — "Claude API").
 */
export class ResponseParser {
  static parse(response: ClaudeMessageResponse): ClaudeLyricsResult {
    const text = ResponseParser.extractText(response);
    const json = ResponseParser.parseJson(text);
    return ResponseParser.validate(json);
  }

  private static extractText(response: ClaudeMessageResponse): string {
    const textBlock = response.content?.find(
      (block): block is ClaudeContentBlock & { text: string } =>
        block.type === "text" && typeof block.text === "string" && block.text.trim().length > 0,
    );

    if (!textBlock) {
      throw new ExternalApiError("Claude response did not contain any text content.", {
        code: "claude.empty_response",
      });
    }

    return textBlock.text;
  }

  private static parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new ExternalApiError("Claude response was not valid JSON.", {
        code: "claude.invalid_json",
        cause,
        context: { text },
      });
    }
  }

  private static validate(json: unknown): ClaudeLyricsResult {
    const result = claudeLyricsResponseSchema.safeParse(json);

    if (!result.success) {
      throw new ExternalApiError("Claude response did not match the expected schema.", {
        code: "claude.malformed_response",
        context: { issues: result.error.issues },
      });
    }

    return result.data;
  }
}
