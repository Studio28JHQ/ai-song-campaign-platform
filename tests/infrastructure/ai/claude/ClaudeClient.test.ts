import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeClient } from "@/infrastructure/ai/claude/ClaudeClient";

const mockLoggerError = vi.fn();
const mockLoggerInfo = vi.fn();

vi.mock("@/shared/logger/logger", () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("ClaudeClient.sendMessage", () => {
  beforeEach(() => {
    mockLoggerError.mockClear();
    mockLoggerInfo.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sends the expected request and returns the parsed response, without ever hitting a real network", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ClaudeClient();
    const result = await client.sendMessage({ system: "sys", user: "usr" });

    expect(result).toEqual({ content: [{ type: "text", text: "{}" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBeTruthy();
    expect(headers["x-api-key"]).toBeTruthy();

    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("sys");
    expect(body.messages).toEqual([{ role: "user", content: "usr" }]);
    // Measured production value (Claude max_tokens sizing investigation) — Claude only.
    expect(body.max_tokens).toBe(4096);
  });

  it("throws a shared error on a non-ok response, without retrying (4xx is not retried)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthorized" }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ClaudeClient();

    await expect(client.sendMessage({ system: "sys", user: "usr" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the response body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("invalid json");
        },
      }),
    );

    const client = new ClaudeClient();

    await expect(client.sendMessage({ system: "sys", user: "usr" })).rejects.toThrow();
  });

  it("throws (routing through the same shared-unavailable flow) when the response is missing the expected content array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        // No `content` field at all — an incomplete/malformed envelope.
        json: async () => ({ stop_reason: "end_turn" }),
      }),
    );

    const client = new ClaudeClient();

    await expect(client.sendMessage({ system: "sys", user: "usr" })).rejects.toMatchObject({
      code: "claude.incomplete_response",
    });
  });

  it("rejects a truncated response (stop_reason: max_tokens) without parsing it, routing through the same shared-unavailable flow", async () => {
    const partialLyricsText =
      '{"approved": true, "reason": null, "lyrics": "[Intro]\\nShhh, escucha bajito the ocean nev';
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: partialLyricsText }],
          stop_reason: "max_tokens",
          usage: {
            input_tokens: 4179,
            output_tokens: 4096,
            output_tokens_details: { thinking_tokens: 1640 },
          },
        }),
      }),
    );

    const client = new ClaudeClient();

    await expect(client.sendMessage({ system: "sys", user: "usr" })).rejects.toMatchObject({
      code: "claude.response_truncated",
    });

    // Logs metadata only — never the partial lyrics/content text.
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Claude response truncated (max_tokens reached)",
      expect.objectContaining({
        stopReason: "max_tokens",
        inputTokens: 4179,
        outputTokens: 4096,
        thinkingTokens: 1640,
        attempt: 1,
        durationMs: expect.any(Number),
      }),
    );
    const loggedText = JSON.stringify([
      ...mockLoggerInfo.mock.calls,
      ...mockLoggerError.mock.calls,
    ]);
    expect(loggedText).not.toContain(partialLyricsText);
    expect(loggedText).not.toContain("Shhh, escucha");
    // Never even attempted a completion log for a truncated response.
    expect(mockLoggerInfo).not.toHaveBeenCalledWith("Claude request completed", expect.anything());
  });

  it("accepts a complete response when stop_reason is end_turn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: '{"approved": true}' }],
          stop_reason: "end_turn",
          usage: { input_tokens: 4159, output_tokens: 1327 },
        }),
      }),
    );

    const client = new ClaudeClient();
    const result = await client.sendMessage({ system: "sys", user: "usr" });

    expect(result.content).toEqual([{ type: "text", text: '{"approved": true}' }]);
  });

  it("logs full diagnostics (attempt, model, stop_reason, token counts) on a successful response, without logging prompt content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: "{}" }],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 304,
            output_tokens: 986,
            output_tokens_details: { thinking_tokens: 72 },
          },
        }),
      }),
    );

    const client = new ClaudeClient();
    await client.sendMessage({
      system: "top secret system prompt",
      user: "the parent's private message",
    });

    expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
    const [message, meta] = mockLoggerInfo.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe("Claude request completed");
    expect(meta).toMatchObject({
      attempt: 1,
      model: "claude-sonnet-5",
      stopReason: "end_turn",
      inputTokens: 304,
      outputTokens: 986,
      thinkingTokens: 72,
      totalTokens: 1290,
    });
    expect(typeof meta.durationMs).toBe("number");

    // Never logs the actual prompt/user content anywhere.
    const loggedText = JSON.stringify([
      ...mockLoggerInfo.mock.calls,
      ...mockLoggerError.mock.calls,
    ]);
    expect(loggedText).not.toContain("top secret system prompt");
    expect(loggedText).not.toContain("the parent's private message");
  });

  it("schedules its abort timer at the 60s Claude-specific override, not the shared 10s default", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: "text", text: "{}" }] }),
      }),
    );

    const client = new ClaudeClient();
    await client.sendMessage({ system: "sys", user: "usr" });

    // `requestOnce`'s own abort-timer `setTimeout` call — the shared
    // default (10_000) would appear here instead if the override weren't
    // wired through.
    const scheduledDelays = setTimeoutSpy.mock.calls.map(([, delay]) => delay);
    expect(scheduledDelays).toContain(60_000);
    expect(scheduledDelays).not.toContain(10_000);

    setTimeoutSpy.mockRestore();
  });

  it("detects an AbortError and logs the timeout diagnostics for that attempt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("This operation was aborted", "AbortError")),
    );

    const client = new ClaudeClient();

    await expect(client.sendMessage({ system: "sys", user: "usr" })).rejects.toThrow();

    // Every attempt (shared default: 3 total) aborts the same way here.
    expect(mockLoggerError).toHaveBeenCalledTimes(3);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Claude request aborted (timeout exceeded)",
        expect.objectContaining({
          timeoutMs: 60_000,
          attempt,
          abortErrorConfirmed: true,
          elapsedMs: expect.any(Number),
        }),
      );
    }
  });

  it("still retries up to the shared default retry count on a 5xx, unaffected by the Claude-specific timeout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: "text", text: "{}" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ClaudeClient();
    const result = await client.sendMessage({ system: "sys", user: "usr" });

    // Shared HTTP_DEFAULT_RETRY_COUNT (2) → 3 total attempts, unchanged.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ content: [{ type: "text", text: "{}" }] });
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "Claude request completed",
      expect.objectContaining({ attempt: 3 }),
    );
  });
});
