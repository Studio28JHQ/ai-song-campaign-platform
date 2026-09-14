import { describe, expect, it, vi } from "vitest";
import type { ClaudeClient } from "@/infrastructure/ai/claude/ClaudeClient";
import { ClaudeLyricsService } from "@/infrastructure/ai/claude/ClaudeLyricsService";

const baseInput = {
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

  it("returns a rejected result without throwing, from the same single request", async () => {
    const client = fakeClient({
      approved: false,
      reason: "Contains offensive language.",
      lyrics: null,
      musicMood: null,
      musicDirection: null,
    });
    const service = new ClaudeLyricsService(client);

    const result = await service.generateAndModerate({
      ...baseInput,
      parentMessage: "bad content",
    });

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(result.approved).toBe(false);
    expect(result.reason).toBe("Contains offensive language.");
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

describe("ClaudeLyricsService.generateAndModerate — Sprint v1.6 (300-330 character target): bounded retry on over-limit lyrics", () => {
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

  it("retries once, with the exact same prompt, when the first response's lyrics exceed 360 characters, and succeeds on the second attempt", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(responseWith({ lyrics: "a".repeat(390) }))
      .mockResolvedValueOnce(responseWith({ lyrics: "a".repeat(315) }));
    const client = { sendMessage } as unknown as ClaudeClient;
    const service = new ClaudeLyricsService(client);

    const result = await service.generateAndModerate(baseInput);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    // The exact same prompt both times — a retry re-asks the same
    // question rather than asking Claude to shorten its previous answer.
    expect(sendMessage.mock.calls[0][0]).toEqual(sendMessage.mock.calls[1][0]);
    expect(result.approved).toBe(true);
    expect(result.lyrics).toHaveLength(315);
  });

  it("does not retry a second time — the retry is bounded, never unbounded — when every attempt keeps exceeding 360 characters", async () => {
    const sendMessage = vi.fn().mockResolvedValue(responseWith({ lyrics: "a".repeat(400) }));
    const client = { sendMessage } as unknown as ClaudeClient;
    const service = new ClaudeLyricsService(client);

    await expect(service.generateAndModerate(baseInput)).rejects.toThrow();
    // 1 initial attempt + 1 retry = 2 total calls, never more.
    expect(sendMessage).toHaveBeenCalledTimes(2);
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
