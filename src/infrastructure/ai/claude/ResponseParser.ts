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

// Sprint v1.5 — Compact Commercial Jingle. Mirrors the same
// length-bounding pattern already used for musicMood/musicDirection
// above, extended to `lyrics`: the prompt's own 360-character hard
// maximum (see `ai/claude/PromptBuilder`'s `WRITING_INSTRUCTIONS` —
// "every section label, every line, every space, every line break, and
// every punctuation mark") is a prose instruction only, with nothing
// upstream enforcing it — a real generation was observed exceeding it
// (456 characters). Counted the same way the prompt itself specifies:
// the raw string, untrimmed, including every label/space/line
// break/punctuation mark — never `.trim()`ed before this check, unlike
// the emptiness check below, since trimming could hide a lyric that is
// only over the limit because of leading/trailing whitespace Claude
// itself produced. An over-limit lyric is rejected here exactly like
// any other schema violation (`claude.malformed_response`) — never
// truncated, which could cut a lyric off mid-word or mid-section.
const LYRICS_MAX_LENGTH = 360;

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

      const lyricsOk =
        typeof value.lyrics === "string" &&
        value.lyrics.trim().length > 0 &&
        value.lyrics.length <= LYRICS_MAX_LENGTH;

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
        "an approved response requires non-empty lyrics within the 360-character maximum and a musicMood/musicDirection within their configured length bounds; a rejected response requires a non-empty reason.",
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
    // Checked ahead of the general schema validation below, as its own
    // distinctly-coded error, so callers (see `ClaudeLyricsService`) can
    // tell "the lyrics themselves were the only problem, and a fresh
    // generation is likely to succeed" apart from every other kind of
    // malformed response (missing fields, out-of-bounds musicMood/
    // musicDirection, wrong types) — none of which a retry would fix.
    // The general schema's own `lyricsOk` length check further below
    // still independently enforces the same 360-character hard cap as a
    // backstop; this only adds a more specific signal for this one case.
    if (
      typeof json === "object" &&
      json !== null &&
      "approved" in json &&
      (json as { approved: unknown }).approved === true &&
      "lyrics" in json &&
      typeof (json as { lyrics: unknown }).lyrics === "string" &&
      (json as { lyrics: string }).lyrics.length > LYRICS_MAX_LENGTH
    ) {
      const lyricsLength = (json as { lyrics: string }).lyrics.length;
      throw new ExternalApiError(
        `Claude's lyrics were ${lyricsLength} characters, over the ${LYRICS_MAX_LENGTH}-character maximum.`,
        {
          code: "claude.lyrics_too_long",
          context: { lyricsLength, maxLength: LYRICS_MAX_LENGTH },
        },
      );
    }

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
