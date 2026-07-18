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
