import { describe, expect, it } from "vitest";
import { ResponseParser } from "@/infrastructure/ai/claude/ResponseParser";
import type { ClaudeMessageResponse } from "@/infrastructure/ai/claude/types";
import { ExternalApiError } from "@/shared/errors";

function textResponse(text: string): ClaudeMessageResponse {
  return { content: [{ type: "text", text }] };
}

describe("ResponseParser.parse", () => {
  it("parses an approved response", () => {
    const response = textResponse(
      JSON.stringify({
        approved: true,
        reason: null,
        lyrics: "Title\nVerse 1\n...",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      }),
    );

    const result = ResponseParser.parse(response);

    expect(result.approved).toBe(true);
    expect(result.lyrics).toContain("Title");
    expect(result.reason).toBeNull();
    expect(result.musicMood).toBe("Warm, joyful and playful.");
    expect(result.musicDirection).toBe("Warm acoustic arrangement with gentle piano and ukulele.");
  });

  it("parses a rejected response", () => {
    const response = textResponse(
      JSON.stringify({
        approved: false,
        reason: "Contains political content.",
        lyrics: null,
        musicMood: null,
        musicDirection: null,
      }),
    );

    const result = ResponseParser.parse(response);

    expect(result.approved).toBe(false);
    expect(result.reason).toBe("Contains political content.");
    expect(result.lyrics).toBeNull();
    expect(result.musicMood).toBeNull();
    expect(result.musicDirection).toBeNull();
  });

  it("throws on non-JSON text", () => {
    expect(() => ResponseParser.parse(textResponse("not json"))).toThrow();
  });

  it("throws when approved is true but lyrics is missing", () => {
    const response = textResponse(
      JSON.stringify({
        approved: true,
        reason: null,
        lyrics: null,
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement.",
      }),
    );
    expect(() => ResponseParser.parse(response)).toThrow();
  });

  it("throws when approved is true but lyrics is an empty string", () => {
    const response = textResponse(
      JSON.stringify({
        approved: true,
        reason: null,
        lyrics: "   ",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement.",
      }),
    );
    expect(() => ResponseParser.parse(response)).toThrow();
  });

  it("throws when approved is false but reason is missing", () => {
    const response = textResponse(
      JSON.stringify({
        approved: false,
        reason: null,
        lyrics: null,
        musicMood: null,
        musicDirection: null,
      }),
    );
    expect(() => ResponseParser.parse(response)).toThrow();
  });

  it("throws when approved is true but musicMood is missing (Sprint v1.1 — AI Musical Direction)", () => {
    const response = textResponse(
      JSON.stringify({
        approved: true,
        reason: null,
        lyrics: "Title\n...",
        musicMood: null,
        musicDirection: "Warm acoustic arrangement.",
      }),
    );
    expect(() => ResponseParser.parse(response)).toThrow();
  });

  it("throws when approved is true but musicDirection is missing (Sprint v1.1 — AI Musical Direction)", () => {
    const response = textResponse(
      JSON.stringify({
        approved: true,
        reason: null,
        lyrics: "Title\n...",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "",
      }),
    );
    expect(() => ResponseParser.parse(response)).toThrow();
  });

  it("throws when there is no text content block", () => {
    const response: ClaudeMessageResponse = { content: [{ type: "tool_use" }] };
    expect(() => ResponseParser.parse(response)).toThrow();
  });

  it("throws when the JSON does not match the expected shape at all", () => {
    expect(() => ResponseParser.parse(textResponse(JSON.stringify({ foo: "bar" })))).toThrow();
  });

  it("throws when a required field has the wrong type", () => {
    const response = textResponse(
      JSON.stringify({
        approved: "yes",
        reason: null,
        lyrics: null,
        musicMood: null,
        musicDirection: null,
      }),
    );
    expect(() => ResponseParser.parse(response)).toThrow();
  });
});

describe("ResponseParser.parse — Sprint v1.2 (AI Safety Hardening): musicMood/musicDirection length bounds", () => {
  function approvedResponse(overrides: Record<string, unknown> = {}) {
    return textResponse(
      JSON.stringify({
        approved: true,
        reason: null,
        lyrics: "Title\nVerse 1\n...",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
        ...overrides,
      }),
    );
  }

  it("accepts a musicMood/musicDirection within bounds", () => {
    const result = ResponseParser.parse(approvedResponse());
    expect(result.musicMood).toBe("Warm, joyful and playful.");
    expect(result.musicDirection).toBe("Warm acoustic arrangement with gentle piano and ukulele.");
  });

  it("rejects a musicMood shorter than the configured minimum", () => {
    expect(() => ResponseParser.parse(approvedResponse({ musicMood: "Hi" }))).toThrow();
  });

  it("rejects a musicMood longer than the configured maximum", () => {
    expect(() => ResponseParser.parse(approvedResponse({ musicMood: "a".repeat(151) }))).toThrow();
  });

  it("rejects a musicDirection shorter than the configured minimum", () => {
    expect(() => ResponseParser.parse(approvedResponse({ musicDirection: "Too short" }))).toThrow();
  });

  it("rejects a musicDirection longer than the configured maximum", () => {
    expect(() =>
      ResponseParser.parse(approvedResponse({ musicDirection: "a".repeat(401) })),
    ).toThrow();
  });

  it("rejects a malformed response before it could ever be persisted (thrown, never returned)", () => {
    let thrown = false;
    try {
      ResponseParser.parse(approvedResponse({ musicMood: "" }));
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(true);
  });
});

describe("ResponseParser.parse — Sprint v1.5 (Compact Commercial Jingle): 360-character lyrics maximum", () => {
  function approvedResponse(overrides: Record<string, unknown> = {}) {
    return textResponse(
      JSON.stringify({
        approved: true,
        reason: null,
        lyrics: "[Verse]\n...\n\n[Verse]\n...\n\n[Chorus]\n...\n\n[Ending]\nSensyderm Baby",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
        ...overrides,
      }),
    );
  }

  it("accepts lyrics exactly at the 360-character maximum", () => {
    const lyrics = "a".repeat(360);
    const result = ResponseParser.parse(approvedResponse({ lyrics }));
    expect(result.lyrics).toBe(lyrics);
    expect(result.lyrics).toHaveLength(360);
  });

  it("accepts lyrics comfortably under the 360-character maximum", () => {
    const lyrics =
      "[Verse]\nCorto y dulce\n\n[Verse]\nSigue el juego\n\n[Chorus]\nMi amor\n\n[Ending]\nSensyderm Baby";
    const result = ResponseParser.parse(approvedResponse({ lyrics }));
    expect(result.lyrics).toBe(lyrics);
    expect(lyrics.length).toBeLessThan(360);
  });

  it("accepts lyrics within the new normal 300-330 character target range", () => {
    const lyrics = "a".repeat(315);
    const result = ResponseParser.parse(approvedResponse({ lyrics }));
    expect(result.lyrics).toBe(lyrics);
    expect(lyrics.length).toBeGreaterThanOrEqual(300);
    expect(lyrics.length).toBeLessThanOrEqual(330);
  });

  it("rejects lyrics one character over the 360-character maximum, exactly the observed real-world failure (456 chars), with the specific claude.lyrics_too_long code", () => {
    expect(() => ResponseParser.parse(approvedResponse({ lyrics: "a".repeat(361) }))).toThrow();
    expect(() => ResponseParser.parse(approvedResponse({ lyrics: "a".repeat(456) }))).toThrow();

    const error = ((): unknown => {
      try {
        ResponseParser.parse(approvedResponse({ lyrics: "a".repeat(390) }));
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ExternalApiError);
    expect((error as ExternalApiError).code).toBe("claude.lyrics_too_long");
    expect((error as ExternalApiError).context).toEqual({ lyricsLength: 390, maxLength: 360 });
  });

  it("distinguishes the lyrics-too-long case (claude.lyrics_too_long) from every other malformed-response case (claude.malformed_response) — a retry-triggering signal only for this one cause", () => {
    const tooLongError = ((): unknown => {
      try {
        ResponseParser.parse(approvedResponse({ lyrics: "a".repeat(400) }));
      } catch (e) {
        return e;
      }
    })();
    expect((tooLongError as ExternalApiError).code).toBe("claude.lyrics_too_long");

    // A missing musicMood is unrelated to lyric length — must never be
    // reported as claude.lyrics_too_long, since retrying wouldn't fix it.
    const missingMoodError = ((): unknown => {
      try {
        ResponseParser.parse(approvedResponse({ musicMood: null }));
      } catch (e) {
        return e;
      }
    })();
    expect((missingMoodError as ExternalApiError).code).toBe("claude.malformed_response");

    // An over-limit musicDirection is also unrelated to lyric length.
    const directionTooLongError = ((): unknown => {
      try {
        ResponseParser.parse(approvedResponse({ musicDirection: "a".repeat(401) }));
      } catch (e) {
        return e;
      }
    })();
    expect((directionTooLongError as ExternalApiError).code).toBe("claude.malformed_response");
  });

  it("counts the raw string exactly as returned — labels, spaces, punctuation, and line breaks all count, never trimmed before the length check", () => {
    // 350 real characters plus 11 trailing spaces = 361 — over the
    // limit only because of trailing whitespace, which must still count
    // (the prompt itself specifies counting "every space").
    const lyrics = "a".repeat(350) + " ".repeat(11);
    expect(lyrics).toHaveLength(361);
    expect(() => ResponseParser.parse(approvedResponse({ lyrics }))).toThrow();
  });

  it("an over-limit lyric is rejected outright — never truncated, silently persisted, or returned", () => {
    let thrown = false;
    try {
      ResponseParser.parse(approvedResponse({ lyrics: "a".repeat(400) }));
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(true);
  });
});
