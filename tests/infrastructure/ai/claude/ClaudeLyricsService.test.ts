import { describe, expect, it, vi } from "vitest";
import type { ClaudeClient } from "@/infrastructure/ai/claude/ClaudeClient";
import { ClaudeLyricsService } from "@/infrastructure/ai/claude/ClaudeLyricsService";
import { PUBLIC_MODERATION_REASON } from "@/infrastructure/ai/claude/moderationCategories";

const baseInput = {
  leadId: "11111111-1111-1111-1111-111111111111",
  babyName: "Baby Doe",
  parentMessage: "A gentle bedtime song.",
  mood: { name: "Calm" },
  language: "en",
};

function fakeClient(responseJson: unknown): ClaudeClient {
  return {
    sendMessage: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(responseJson) }],
    }),
  } as unknown as ClaudeClient;
}

describe("ClaudeLyricsService.generateAndModerate", () => {
  it("makes exactly one Claude request and returns an approved result", async () => {
    const client = fakeClient({
      approved: true,
      reason: null,
      lyrics: "Title\nVerse 1\n...",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
    });
    const service = new ClaudeLyricsService(client);

    const result = await service.generateAndModerate(baseInput);

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(result.approved).toBe(true);
    expect(result.lyrics).toContain("Title");
    expect(result.musicMood).toBe("Warm, joyful and playful.");
    expect(result.musicDirection).toBe("Warm acoustic arrangement with gentle piano and ukulele.");
  });

  it("returns a rejected result without throwing, after one directed repair attempt", async () => {
    // Sprint FINAL-4 — Targeted Lyrics Repair: a rejection now buys one
    // directed retry. Two rejections end the request, without throwing,
    // and what the parent sees is the application's own message.
    const client = fakeClient({
      approved: false,
      reason: "Contains offensive language.",
      moderationCategory: "ABUSE",
      lyrics: null,
      musicMood: null,
      musicDirection: null,
    });
    const service = new ClaudeLyricsService(client);

    const result = await service.generateAndModerate({
      ...baseInput,
      parentMessage: "bad content",
    });

    expect(client.sendMessage).toHaveBeenCalledTimes(2);
    expect(result.approved).toBe(false);
    expect(result.reason).toBe(PUBLIC_MODERATION_REASON);
    expect(result.reason).not.toContain("offensive");
    expect(result.lyrics).toBeNull();
  });

  it("propagates a parsing failure as a thrown error rather than a silent fallback", async () => {
    const client = {
      sendMessage: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "not json" }] }),
    } as unknown as ClaudeClient;
    const service = new ClaudeLyricsService(client);

    await expect(service.generateAndModerate(baseInput)).rejects.toThrow();
  });
});

describe("ClaudeLyricsService.generateAndModerate — bounded retry on over-limit lyrics", () => {
  function responseWith(overrides: Record<string, unknown> = {}) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            approved: true,
            reason: null,
            lyrics: "[Verse]\n...\n\n[Verse]\n...\n\n[Chorus]\n...\n\n[Ending]\nSensyderm Baby",
            musicMood: "Warm, joyful and playful.",
            musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
            ...overrides,
          }),
        },
      ],
    };
  }

  it("repairs the over-long draft on the second call instead of re-asking the same question", async () => {
    const tooLong = "a".repeat(390);
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(responseWith({ lyrics: tooLong }))
      .mockResolvedValueOnce(responseWith({ lyrics: "a".repeat(315) }));
    const client = { sendMessage } as unknown as ClaudeClient;
    const service = new ClaudeLyricsService(client);

    const result = await service.generateAndModerate(baseInput);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    // Sprint FINAL-4 — Targeted Lyrics Repair: the second call is no
    // longer the same question asked again. It carries the draft that
    // was just rejected, as content to edit.
    expect(sendMessage.mock.calls[0][0]).not.toEqual(sendMessage.mock.calls[1][0]);
    expect(sendMessage.mock.calls[1][0].user).toContain(tooLong);
    expect(sendMessage.mock.calls[1][0].user).toContain("<lyrics_to_edit>");
    expect(result.approved).toBe(true);
    expect(result.lyrics).toHaveLength(315);
  });

  it("stops after the bounded number of retries — never unbounded — when every attempt keeps exceeding 360 characters", async () => {
    const sendMessage = vi.fn().mockResolvedValue(responseWith({ lyrics: "a".repeat(400) }));
    const client = { sendMessage } as unknown as ClaudeClient;
    const service = new ClaudeLyricsService(client);

    await expect(service.generateAndModerate(baseInput)).rejects.toThrow();
    // 1 initial attempt + `LYRICS_TOO_LONG_RETRY_LIMIT` (2) retries = 3
    // total calls, never more. The bound was raised from 1 to 2 after a
    // live re-measurement put the single-call overshoot rate at ~1 in 8;
    // what this test guards is that the retry stays *bounded*.
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it("succeeds on the second retry when the first two attempts both exceed 360 characters", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(responseWith({ lyrics: "a".repeat(400) }))
      .mockResolvedValueOnce(responseWith({ lyrics: "b".repeat(400) }))
      .mockResolvedValue(responseWith({ lyrics: "c".repeat(300) }));
    const client = { sendMessage } as unknown as ClaudeClient;
    const service = new ClaudeLyricsService(client);

    const result = await service.generateAndModerate(baseInput);

    expect(result.approved).toBe(true);
    expect(result.lyrics).toBe("c".repeat(300));
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it("never retries for an unrelated malformed response (e.g. a missing musicMood) — only an over-limit lyric triggers a retry", async () => {
    const sendMessage = vi.fn().mockResolvedValue(responseWith({ musicMood: null }));
    const client = { sendMessage } as unknown as ClaudeClient;
    const service = new ClaudeLyricsService(client);

    await expect(service.generateAndModerate(baseInput)).rejects.toThrow();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("never retries when the response is not valid JSON at all", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "not json" }] });
    const client = { sendMessage } as unknown as ClaudeClient;
    const service = new ClaudeLyricsService(client);

    await expect(service.generateAndModerate(baseInput)).rejects.toThrow();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("makes exactly one request when the first response is already within the 360-character limit — no retry occurs", async () => {
    const sendMessage = vi.fn().mockResolvedValue(responseWith({ lyrics: "a".repeat(320) }));
    const client = { sendMessage } as unknown as ClaudeClient;
    const service = new ClaudeLyricsService(client);

    const result = await service.generateAndModerate(baseInput);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(result.lyrics).toHaveLength(320);
  });
});

/**
 * Sprint FINAL-2 — Lyrics Generation Traceability.
 *
 * What these tests pin down is the one thing the rest of the system could
 * not see before: a lead whose lyrics were never generated used to leave
 * no trace at all, so "never tried" and "tried and Claude failed" looked
 * identical in the database. Every case below asserts what gets recorded
 * *and* that recording never changes what the parent gets.
 */
describe("ClaudeLyricsService.generateAndModerate — attempt recording", () => {
  const LEAD_ID = baseInput.leadId;

  interface RecordedCall {
    kind: "started" | "finished";
    leadId?: string;
    providerModel?: string;
    handleId?: string;
    result?: string;
    errorCode?: string | null;
    failureReason?: string | null;
  }

  /** A recorder that logs, in order, exactly what the service asked it to write. */
  function fakeRecorder(options: { failOn?: "started" | "finished" } = {}) {
    const calls: RecordedCall[] = [];
    let opened = 0;

    return {
      calls,
      recorder: {
        async attemptStarted(input: { leadId: string; providerModel: string }) {
          if (options.failOn === "started") {
            throw new Error("database unreachable");
          }
          opened += 1;
          const id = `attempt-${opened}`;
          calls.push({ kind: "started", leadId: input.leadId, providerModel: input.providerModel });
          return { id };
        },
        async attemptFinished(
          handle: { id: string },
          outcome: { result: string; errorCode: string | null; failureReason: string | null },
        ) {
          if (options.failOn === "finished") {
            throw new Error("database unreachable");
          }
          calls.push({
            kind: "finished",
            handleId: handle.id,
            result: outcome.result,
            errorCode: outcome.errorCode,
            failureReason: outcome.failureReason,
          });
        },
      },
    };
  }

  function approvedResponse(overrides: Record<string, unknown> = {}) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            approved: true,
            reason: null,
            lyrics: "[Verse]\nSomething short and sweet.",
            musicMood: "Warm, joyful and playful.",
            musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
            ...overrides,
          }),
        },
      ],
    };
  }

  function clientThatThrows(error: unknown): ClaudeClient {
    return { sendMessage: vi.fn().mockRejectedValue(error) } as unknown as ClaudeClient;
  }

  /** The error codes recorded for a run that is expected to throw. */
  async function recordedCodesForFailure(error: unknown): Promise<Array<string | null>> {
    const { calls, recorder } = fakeRecorder();
    const service = new ClaudeLyricsService(clientThatThrows(error), recorder);

    await expect(service.generateAndModerate(baseInput)).rejects.toThrow();

    return calls.filter((call) => call.kind === "finished").map((call) => call.errorCode ?? null);
  }

  it("opens the attempt before calling Claude, so a call that never returns still leaves evidence", async () => {
    const order: string[] = [];
    const { recorder } = fakeRecorder();
    const tracking = {
      ...recorder,
      async attemptStarted(input: { leadId: string; providerModel: string }) {
        order.push("record-started");
        return recorder.attemptStarted(input);
      },
    };
    const client = {
      sendMessage: vi.fn(async () => {
        order.push("claude-called");
        return approvedResponse();
      }),
    } as unknown as ClaudeClient;

    await new ClaudeLyricsService(client, tracking).generateAndModerate(baseInput);

    expect(order).toEqual(["record-started", "claude-called"]);
  });

  it("records a successful generation as one attempt closed as SUCCESS, with no error code", async () => {
    const client = {
      sendMessage: vi.fn().mockResolvedValue(approvedResponse()),
    } as unknown as ClaudeClient;
    const { calls, recorder } = fakeRecorder();

    const result = await new ClaudeLyricsService(client, recorder).generateAndModerate(baseInput);

    expect(result.approved).toBe(true);
    expect(calls).toEqual([
      { kind: "started", leadId: LEAD_ID, providerModel: "claude-sonnet-5" },
      {
        kind: "finished",
        handleId: "attempt-1",
        result: "SUCCESS",
        errorCode: null,
        failureReason: null,
      },
    ]);
  });

  it("records a moderation rejection as an outcome, not an error — it carries no error code", async () => {
    const client = {
      sendMessage: vi.fn().mockResolvedValue(
        approvedResponse({
          approved: false,
          reason: "Contains offensive language.",
          moderationCategory: "ABUSE",
          lyrics: null,
          musicMood: null,
          musicDirection: null,
        }),
      ),
    } as unknown as ClaudeClient;
    const { calls, recorder } = fakeRecorder();

    const result = await new ClaudeLyricsService(client, recorder).generateAndModerate(baseInput);

    expect(result.approved).toBe(false);
    expect(calls[1]).toEqual({
      kind: "finished",
      handleId: "attempt-1",
      result: "MODERATION_REJECTED",
      errorCode: null,
      // Sprint FINAL-4: the internal category leads, so the campaign team
      // can group these; Claude's own wording follows as context.
      failureReason: "ABUSE — Contains offensive language.",
    });
  });

  it("records the internal length retry as two attempts — the parent's own attempt count is untouched", async () => {
    // The case that motivated all of this: an over-long lyric was retried
    // silently, so a failure the parent saw as `claude_unavailable` left no
    // trace whatsoever. Two rows, one functional attempt.
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(approvedResponse({ lyrics: "a".repeat(390) }))
      .mockResolvedValueOnce(approvedResponse({ lyrics: "a".repeat(315) }));
    const { calls, recorder } = fakeRecorder();

    const result = await new ClaudeLyricsService(
      { sendMessage } as unknown as ClaudeClient,
      recorder,
    ).generateAndModerate(baseInput);

    expect(result.approved).toBe(true);
    // Two calls, not three: the retry succeeded, so the bound was never reached.
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(calls.map((call) => [call.kind, call.result ?? null, call.errorCode ?? null])).toEqual([
      ["started", null, null],
      ["finished", "FAILED", "CLAUDE_OUTPUT_TOO_LONG"],
      ["started", null, null],
      ["finished", "SUCCESS", null],
    ]);
  });

  it("records every attempt when the lyrics stay over the limit until the retries run out", async () => {
    const sendMessage = vi.fn().mockResolvedValue(approvedResponse({ lyrics: "a".repeat(400) }));
    const { calls, recorder } = fakeRecorder();
    const service = new ClaudeLyricsService({ sendMessage } as unknown as ClaudeClient, recorder);

    await expect(service.generateAndModerate(baseInput)).rejects.toThrow();

    // Measured against the current code, not assumed: one initial call plus
    // `LYRICS_TOO_LONG_RETRY_LIMIT` (2) retries. The recorded rows and the
    // real Claude calls are pinned to the same number here on purpose —
    // that equality is the whole promise of this table.
    expect(sendMessage).toHaveBeenCalledTimes(3);
    const finished = calls.filter((call) => call.kind === "finished");
    expect(finished).toHaveLength(3);
    expect(finished.every((call) => call.errorCode === "CLAUDE_OUTPUT_TOO_LONG")).toBe(true);
    expect(calls.filter((call) => call.kind === "started")).toHaveLength(3);
  });

  it("records throttling apart from every other provider error, since only one of them is transient", async () => {
    const { ExternalApiError } = await import("@/shared/errors");

    await expect(
      recordedCodesForFailure(
        new ExternalApiError("Claude API responded with status 429.", {
          code: "claude.api_error",
          context: { status: 429 },
        }),
      ),
    ).resolves.toEqual(["CLAUDE_RATE_LIMIT"]);

    await expect(
      recordedCodesForFailure(
        new ExternalApiError("Claude API responded with status 500.", {
          code: "claude.api_error",
          context: { status: 500 },
        }),
      ),
    ).resolves.toEqual(["CLAUDE_API_ERROR"]);
  });

  it("records a request that never got an answer as unavailable, not as an API error", async () => {
    const { ExternalApiError } = await import("@/shared/errors");

    await expect(
      recordedCodesForFailure(
        new ExternalApiError("Request failed after 3 attempts.", { code: "http_request_failed" }),
      ),
    ).resolves.toEqual(["CLAUDE_UNAVAILABLE"]);
  });

  it("records a truncated response as an invalid response", async () => {
    const { ExternalApiError } = await import("@/shared/errors");

    await expect(
      recordedCodesForFailure(
        new ExternalApiError("Claude response was truncated at the max_tokens limit.", {
          code: "claude.response_truncated",
        }),
      ),
    ).resolves.toEqual(["CLAUDE_INVALID_RESPONSE"]);
  });

  it("records an unparseable body as an invalid response, from the real parser", async () => {
    const client = {
      sendMessage: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "not json" }] }),
    } as unknown as ClaudeClient;
    const { calls, recorder } = fakeRecorder();
    const service = new ClaudeLyricsService(client, recorder);

    await expect(service.generateAndModerate(baseInput)).rejects.toThrow();

    expect(calls[1]?.errorCode).toBe("CLAUDE_INVALID_RESPONSE");
    // The failure reason is our own message — never the raw response text,
    // which carries the generated lyrics and can echo the parent's message.
    expect(calls[1]?.failureReason).toBe("Claude response was not valid JSON.");
    expect(calls[1]?.failureReason).not.toContain("not json");
  });

  it("records something unanticipated as INTERNAL_ERROR rather than guessing a provider cause", async () => {
    await expect(
      recordedCodesForFailure(new TypeError("cannot read property of undefined")),
    ).resolves.toEqual(["INTERNAL_ERROR"]);
  });

  it("generates exactly as it would untraced when the recorder cannot open an attempt", async () => {
    const client = {
      sendMessage: vi.fn().mockResolvedValue(approvedResponse()),
    } as unknown as ClaudeClient;
    const { calls, recorder } = fakeRecorder({ failOn: "started" });

    const result = await new ClaudeLyricsService(client, recorder).generateAndModerate(baseInput);

    // The whole point: a broken audit trail is never the reason a parent
    // loses their song. No row, no thrown error, no second Claude call.
    expect(result.approved).toBe(true);
    expect(result.lyrics).toContain("Something short and sweet.");
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("generates exactly as it would untraced when the recorder cannot close an attempt", async () => {
    const client = {
      sendMessage: vi.fn().mockResolvedValue(approvedResponse()),
    } as unknown as ClaudeClient;
    const { recorder } = fakeRecorder({ failOn: "finished" });

    const result = await new ClaudeLyricsService(client, recorder).generateAndModerate(baseInput);

    expect(result.approved).toBe(true);
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("still propagates the provider's own error after recording it, unchanged", async () => {
    const { ExternalApiError } = await import("@/shared/errors");
    const original = new ExternalApiError("Claude API responded with status 500.", {
      code: "claude.api_error",
      context: { status: 500 },
    });
    const { recorder } = fakeRecorder();
    const service = new ClaudeLyricsService(clientThatThrows(original), recorder);

    await expect(service.generateAndModerate(baseInput)).rejects.toBe(original);
  });

  it("records nothing at all when no recorder is wired — the default is silent, not broken", async () => {
    const client = {
      sendMessage: vi.fn().mockResolvedValue(approvedResponse()),
    } as unknown as ClaudeClient;

    const result = await new ClaudeLyricsService(client).generateAndModerate(baseInput);

    expect(result.approved).toBe(true);
  });
});
