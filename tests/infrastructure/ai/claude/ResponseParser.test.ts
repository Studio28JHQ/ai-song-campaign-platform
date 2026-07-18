import { describe, expect, it } from "vitest";
import { ResponseParser } from "@/infrastructure/ai/claude/ResponseParser";
import type { ClaudeMessageResponse } from "@/infrastructure/ai/claude/types";

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
