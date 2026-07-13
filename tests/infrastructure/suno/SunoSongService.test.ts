import { describe, expect, it, vi } from "vitest";
import type { SunoClient } from "@/infrastructure/suno/SunoClient";
import { SunoSongService } from "@/infrastructure/suno/SunoSongService";

function fakeClient(raw: unknown): SunoClient {
  return { generate: vi.fn().mockResolvedValue(raw) } as unknown as SunoClient;
}

describe("SunoSongService.generateSong", () => {
  it("builds the prompt, calls the client once, and returns the parsed result", async () => {
    const client = fakeClient({
      id: "suno-123",
      audio_url: "https://cdn.example.com/song.mp3",
      duration: 120,
    });
    const service = new SunoSongService(client);

    const result = await service.generateSong({
      lyrics: "Title\n...",
      moodName: "Joyful",
      sunoPrompt: "upbeat joyful lullaby",
    });

    expect(client.generate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      providerSongId: "suno-123",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });
  });

  it("propagates a malformed response as a thrown error", async () => {
    const client = fakeClient({ foo: "bar" });
    const service = new SunoSongService(client);

    await expect(
      service.generateSong({ lyrics: "Title\n...", moodName: "Joyful", sunoPrompt: "..." }),
    ).rejects.toThrow();
  });
});
