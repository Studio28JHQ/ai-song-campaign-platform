import { describe, expect, it } from "vitest";
import {
  toLyricsAttemptErrorCode,
  toLyricsAttemptFailureReason,
} from "@/infrastructure/ai/claude/lyricsAttemptErrorCode";
import { DatabaseError, ExternalApiError, ValidationError } from "@/shared/errors";

/**
 * Sprint FINAL-2 — Lyrics Generation Traceability. The normalisation that
 * makes `GenerationAttempt.errorCode` groupable: eleven provider codes
 * collapse into the handful of causes that actually call for different
 * responses, and nothing is invented for a cause the provider cannot
 * distinguish.
 */
describe("toLyricsAttemptErrorCode", () => {
  function externalError(code: string, context?: Record<string, unknown>) {
    return new ExternalApiError("message", { code, context });
  }

  it("maps an over-long lyric to its own code — the one failure that is retried internally", () => {
    expect(toLyricsAttemptErrorCode(externalError("claude.lyrics_too_long"))).toBe(
      "CLAUDE_OUTPUT_TOO_LONG",
    );
  });

  it.each([
    "claude.response_truncated",
    "claude.invalid_response_body",
    "claude.empty_response",
    "claude.incomplete_response",
    "claude.malformed_response",
    "claude.invalid_json",
  ])("collapses %s into CLAUDE_INVALID_RESPONSE — all the same thing operationally", (code) => {
    expect(toLyricsAttemptErrorCode(externalError(code))).toBe("CLAUDE_INVALID_RESPONSE");
  });

  it("separates throttling from every other HTTP failure, since only throttling resolves itself", () => {
    expect(toLyricsAttemptErrorCode(externalError("claude.api_error", { status: 429 }))).toBe(
      "CLAUDE_RATE_LIMIT",
    );
  });

  it.each([400, 401, 403, 500, 529])("maps HTTP %s to CLAUDE_API_ERROR", (status) => {
    expect(toLyricsAttemptErrorCode(externalError("claude.api_error", { status }))).toBe(
      "CLAUDE_API_ERROR",
    );
  });

  it("maps a status-less API error to CLAUDE_API_ERROR rather than guessing throttling", () => {
    expect(toLyricsAttemptErrorCode(externalError("claude.api_error"))).toBe("CLAUDE_API_ERROR");
  });

  it("maps a request that never got a response to CLAUDE_UNAVAILABLE", () => {
    expect(toLyricsAttemptErrorCode(externalError("http_request_failed"))).toBe(
      "CLAUDE_UNAVAILABLE",
    );
  });

  it("maps an unrecognised provider error to CLAUDE_API_ERROR — still a provider failure", () => {
    expect(toLyricsAttemptErrorCode(externalError("claude.something_new"))).toBe(
      "CLAUDE_API_ERROR",
    );
  });

  it("maps a validation failure to LYRICS_VALIDATION_ERROR", () => {
    expect(
      toLyricsAttemptErrorCode(
        new ValidationError("Your message is too long.", { code: "lyrics.invalid_parent_message" }),
      ),
    ).toBe("LYRICS_VALIDATION_ERROR");
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["a TypeError (a bug)", new TypeError("undefined is not a function")],
    [
      "a non-provider AppError",
      new DatabaseError("connection lost", { code: "db.connection_lost" }),
    ],
    ["a thrown string", "boom"],
    ["undefined", undefined],
  ])("maps %s to INTERNAL_ERROR rather than inventing a provider cause", (_label, error) => {
    expect(toLyricsAttemptErrorCode(error)).toBe("INTERNAL_ERROR");
  });
});

describe("toLyricsAttemptFailureReason", () => {
  it("stores the message we wrote ourselves", () => {
    expect(
      toLyricsAttemptFailureReason(
        new ExternalApiError(
          "Claude's lyrics were 454 characters, over the 360-character maximum.",
          {
            code: "claude.lyrics_too_long",
          },
        ),
      ),
    ).toBe("Claude's lyrics were 454 characters, over the 360-character maximum.");
  });

  it("never stores the error context, which can carry the raw response and the parent's message", () => {
    const parentMessage = "Mi hija se llama Ana y le encanta bailar";
    const error = new ExternalApiError("Claude response was not valid JSON.", {
      code: "claude.invalid_json",
      context: { text: `{"lyrics": "...", "echo": "${parentMessage}"}` },
    });

    const reason = toLyricsAttemptFailureReason(error);

    expect(reason).toBe("Claude response was not valid JSON.");
    expect(reason).not.toContain(parentMessage);
  });

  it("caps the stored text, so one pathological message cannot bloat the table", () => {
    const reason = toLyricsAttemptFailureReason(new Error("x".repeat(5_000)));
    expect(reason).toHaveLength(300);
  });

  it("returns null for a non-Error and for an empty message", () => {
    expect(toLyricsAttemptFailureReason("boom")).toBeNull();
    expect(toLyricsAttemptFailureReason(new Error("   "))).toBeNull();
  });
});
