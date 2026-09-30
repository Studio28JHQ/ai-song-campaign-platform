import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClaudeClient } from "@/infrastructure/ai/claude/ClaudeClient";
import { ClaudeLyricsService } from "@/infrastructure/ai/claude/ClaudeLyricsService";
import {
  LYRICS_TARGET_MAX_LENGTH,
  LYRICS_TARGET_MIN_LENGTH,
  PromptBuilder,
} from "@/infrastructure/ai/claude/PromptBuilder";
import { LYRICS_MAX_LENGTH, ResponseParser } from "@/infrastructure/ai/claude/ResponseParser";
import { logger } from "@/shared/logger/logger";
import { FIELD_LIMITS, sanitizePlainText } from "@/shared/validation/text";

/**
 * Sprint FINAL-8 — Lyrics Length Control.
 *
 * The audit of 2026-09-30 found that 377 of 848 recorded Claude calls
 * (48.6%) were discarded for producing a lyric over the 360-character
 * maximum, and that the cause was not a missing instruction: the prompt
 * stated the limit four times. It was that the same prompt ranked
 * compactness last of five priorities, told Claude never to cut the
 * parent's story down to fit, and aimed its repair at 340-360 — twenty
 * characters from the limit it was escaping. The limit sat in the middle
 * of the model's own output distribution (accepted lyrics: median 326,
 * p90 352) so roughly half of every generation fell on the wrong side of
 * it.
 *
 * This file holds the four things that must stay true afterwards: 360 is
 * still absolute, the prompts aim well below it, the budget is still
 * three calls, and the sizes are now observable without storing anything
 * a parent wrote.
 */

const LEAD_ID = "11111111-1111-1111-1111-111111111111";

const baseInput = {
  leadId: LEAD_ID,
  babyName: "Liam",
  parentMessage: "Una canción para mi hijo Liam, que se ríe todo el tiempo.",
  mood: { name: "Alegre", description: "upbeat and cheerful" },
  language: "es",
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          approved: true,
          reason: null,
          lyrics: "[Verse]\nLiam se despierta y se pone a reír.",
          musicMood: "Warm, joyful and playful.",
          musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
          moderationCategory: null,
          ...overrides,
        }),
      },
    ],
  };
}

function lyricsOf(length: number): string {
  return "a".repeat(length);
}

function clientReturning(...responses: unknown[]) {
  const sendMessage = vi.fn();
  for (const response of responses) sendMessage.mockResolvedValueOnce(response);
  sendMessage.mockResolvedValue(responses[responses.length - 1]);
  return { sendMessage, client: { sendMessage } as unknown as ClaudeClient };
}

/** Every `claude.lyrics_call` line emitted during a test, in order. */
function metricLines(info: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return info.mock.calls
    .filter((call) => call[0] === "claude.lyrics_call")
    .map((call) => call[1] as Record<string, unknown>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("[1][2][3] the hard maximum, unchanged", () => {
  it("[1] accepts a lyric of exactly the maximum", () => {
    expect(LYRICS_MAX_LENGTH).toBe(360);

    const parsed = ResponseParser.parse(payload({ lyrics: lyricsOf(LYRICS_MAX_LENGTH) }));

    expect(parsed.approved).toBe(true);
    expect(parsed.lyrics).toHaveLength(LYRICS_MAX_LENGTH);
  });

  it("[2] rejects a lyric one character over the maximum", () => {
    expect(() => ResponseParser.parse(payload({ lyrics: lyricsOf(361) }))).toThrowError(
      /361 characters/,
    );
  });

  it("[3] rejects a 500-character lyric", () => {
    expect(() => ResponseParser.parse(payload({ lyrics: lyricsOf(500) }))).toThrowError(
      /500 characters/,
    );
  });

  it("[2][3] never truncates an over-long lyric into an acceptable one", () => {
    // Retargeting the prompt must not have turned the validator into a
    // shortener: an over-long lyric is refused, not cut to fit, which
    // would sever a verse mid-word and still reach the parent.
    expect(() => ResponseParser.parse(payload({ lyrics: lyricsOf(500) }))).toThrow();
  });

  it("the target window sits below the maximum, with real margin", () => {
    expect(LYRICS_TARGET_MIN_LENGTH).toBeLessThan(LYRICS_TARGET_MAX_LENGTH);
    expect(LYRICS_TARGET_MAX_LENGTH).toBeLessThan(LYRICS_MAX_LENGTH);
    // The margin is the whole point of the change: the superseded repair
    // target left 0-20 characters of room, which the model's own variance
    // swallowed. Anything under ~25 is not a window, it is the limit again.
    expect(LYRICS_MAX_LENGTH - LYRICS_TARGET_MAX_LENGTH).toBeGreaterThanOrEqual(25);
  });
});

describe("[7][9] the call budget", () => {
  it("[7] spends at most three Claude calls for one request, however badly it goes", async () => {
    const { sendMessage, client } = clientReturning(payload({ lyrics: lyricsOf(480) }));

    await expect(new ClaudeLyricsService(client).generateAndModerate(baseInput)).rejects.toThrow();

    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it("[9] fails cleanly when the third call is still over the maximum", async () => {
    const { client } = clientReturning(
      payload({ lyrics: lyricsOf(430) }),
      payload({ lyrics: lyricsOf(395) }),
      payload({ lyrics: lyricsOf(372) }),
    );

    // The production shape of a failed request: it throws the provider's
    // own too-long error rather than returning a half-result, and the
    // caller (`GenerateLyricsForLeadUseCase`) therefore never reaches
    // `consumeAttempt()` — the parent keeps their attempt.
    await expect(
      new ClaudeLyricsService(client).generateAndModerate(baseInput),
    ).rejects.toMatchObject({ code: "claude.lyrics_too_long" });
  });

  it("[8] an over-long first answer triggers a repair rather than ending the request", async () => {
    const { sendMessage, client } = clientReturning(
      payload({ lyrics: lyricsOf(420) }),
      payload({ lyrics: lyricsOf(305) }),
    );

    const result = await new ClaudeLyricsService(client).generateAndModerate(baseInput);

    expect(result.approved).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("[10] the repair call carries the previous draft, so it edits rather than regenerates", async () => {
    const draft = lyricsOf(420);
    const { sendMessage, client } = clientReturning(
      payload({ lyrics: draft }),
      payload({ lyrics: lyricsOf(300) }),
    );

    await new ClaudeLyricsService(client).generateAndModerate(baseInput);

    const repair = sendMessage.mock.calls[1][0] as { user: string };
    expect(repair.user).toContain(draft);
    expect(repair.user).toContain("<lyrics_to_edit>");
  });
});

describe("[11] length metrics", () => {
  it("records the sizes of a successful call, and nothing else", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const lyrics = lyricsOf(302);
    const { client } = clientReturning(payload({ lyrics }));

    await new ClaudeLyricsService(client).generateAndModerate(baseInput);

    const [line] = metricLines(info);
    expect(line).toMatchObject({
      leadId: LEAD_ID,
      call: 1,
      maxCalls: 3,
      kind: "generation",
      parentMessageLength: baseInput.parentMessage.length,
      outputLength: 302,
      result: "SUCCESS",
      errorCode: null,
    });
    expect(line.promptLength).toBeGreaterThan(0);
    expect(typeof line.durationMs).toBe("number");
  });

  it("records the measured length of an over-long draft, and the repair that follows it", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const { client } = clientReturning(
      payload({ lyrics: lyricsOf(422) }),
      payload({ lyrics: lyricsOf(311) }),
    );

    await new ClaudeLyricsService(client).generateAndModerate(baseInput);

    const lines = metricLines(info);
    expect(lines).toHaveLength(2);
    // This is the pair the audit could not reconstruct from the database:
    // what the first call produced, and what the repair of it produced.
    expect(lines[0]).toMatchObject({
      call: 1,
      kind: "generation",
      outputLength: 422,
      result: "FAILED",
      errorCode: "CLAUDE_OUTPUT_TOO_LONG",
    });
    expect(lines[1]).toMatchObject({
      call: 2,
      kind: "length_repair",
      outputLength: 311,
      result: "SUCCESS",
    });
  });

  it("records a moderation rejection with no output length, which is not the same as zero", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const { client } = clientReturning(
      payload({
        approved: false,
        reason: "El mensaje incluye contenido religioso.",
        moderationCategory: "RELIGIOUS_PROPAGANDA",
        lyrics: null,
        musicMood: null,
        musicDirection: null,
      }),
    );

    await new ClaudeLyricsService(client).generateAndModerate(baseInput);

    const lines = metricLines(info);
    expect(lines[0]).toMatchObject({ result: "MODERATION_REJECTED", outputLength: null });
    expect(lines[1]).toMatchObject({ kind: "moderation_repair" });
  });

  it("records a transport failure without inventing an output length", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const sendMessage = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const client = { sendMessage } as unknown as ClaudeClient;

    await expect(new ClaudeLyricsService(client).generateAndModerate(baseInput)).rejects.toThrow();

    expect(metricLines(info)[0]).toMatchObject({
      result: "FAILED",
      outputLength: null,
      errorCode: "INTERNAL_ERROR",
    });
  });

  it("never writes the lyric, the prompt, or the parent's message into the metrics", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const lyrics = "[Verse]\nLiam se despierta y se ríe con el sol.";
    const { client } = clientReturning(payload({ lyrics }));

    await new ClaudeLyricsService(client).generateAndModerate(baseInput);

    const serialised = JSON.stringify(metricLines(info));
    expect(serialised).not.toContain(lyrics);
    expect(serialised).not.toContain(baseInput.parentMessage);
    expect(serialised).not.toContain("Liam se despierta");
    // The parent's own words are represented only by how many there were.
    expect(serialised).toContain(String(baseInput.parentMessage.length));

    // Every value is a number, a short enum, or null — nothing free-form
    // that could carry content in future.
    for (const [key, value] of Object.entries(metricLines(info)[0])) {
      if (key === "leadId" || key === "kind" || key === "result" || key === "errorCode") continue;
      expect(typeof value === "number" || value === null).toBe(true);
    }
  });

  it("never fails a generation because the metrics could not be written", async () => {
    vi.spyOn(logger, "info").mockImplementation(() => {
      throw new Error("log transport down");
    });
    const { client } = clientReturning(payload({ lyrics: lyricsOf(300) }));

    const result = await new ClaudeLyricsService(client).generateAndModerate(baseInput);

    expect(result.approved).toBe(true);
  });
});

describe("[12] the parent's story is not limited by any of this", () => {
  it("still accepts a 600-character story", () => {
    expect(FIELD_LIMITS.lyricsMessage).toBe(600);

    const result = sanitizePlainText("a".repeat(600), FIELD_LIMITS.lyricsMessage);

    expect(result.ok).toBe(true);
  });

  it("rejects 601 rather than silently shortening it", () => {
    const result = sanitizePlainText("a".repeat(601), FIELD_LIMITS.lyricsMessage);

    expect(result.ok).toBe(false);
  });

  it("carries all 600 characters into the prompt, verbatim and undivided", () => {
    // The whole reason the fix is in the writing instructions rather than
    // in the input: the audit refuted the story as the cause (39% of
    // over-long calls came from stories of 150 characters or less, 40%
    // from stories of 451-600), so nothing here may quietly start
    // trimming what a parent wrote.
    const story = `Mi hija ${"á".repeat(200)} ${"b".repeat(391)}`;
    const prompt = PromptBuilder.build({ ...baseInput, parentMessage: story });

    expect(story).toHaveLength(600);
    expect(prompt.user).toContain(story);
    expect(prompt.user).toContain("<parent_message>");
  });

  it("carries the full story into a length repair too, not a shortened copy", () => {
    const story = "c".repeat(600);
    const repair = PromptBuilder.buildLengthRepair(
      { ...baseInput, parentMessage: story },
      { lyrics: lyricsOf(420), musicMood: "Warm", musicDirection: "Acoustic" },
    );

    // The repair prompt does not restate the story — it edits a draft —
    // but it must not have acquired a shortening step for it either.
    expect(repair.user).not.toContain("c".repeat(601));
    expect(repair.user).toContain("<lyrics_to_edit>");
  });
});
