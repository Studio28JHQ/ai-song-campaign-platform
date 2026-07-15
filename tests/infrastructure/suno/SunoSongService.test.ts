import { describe, expect, it, vi } from "vitest";
import type { SunoClient } from "@/infrastructure/suno/SunoClient";
import { SunoSongService } from "@/infrastructure/suno/SunoSongService";

function fakeClient(raw: unknown): SunoClient {
  return { generate: vi.fn().mockResolvedValue(raw) } as unknown as SunoClient;
}

describe("SunoSongService.submitGeneration", () => {
  it("builds the prompt, calls the client once, and returns a submission carrying the provider's id as the task id", async () => {
    const client = fakeClient({
      id: "suno-123",
      audio_url: "https://cdn.example.com/song.mp3",
      duration: 120,
    });
    const service = new SunoSongService(client);

    const submission = await service.submitGeneration({
      lyrics: "Title\n...",
      moodName: "Joyful",
      sunoPrompt: "upbeat joyful lullaby",
    });

    expect(client.generate).toHaveBeenCalledTimes(1);
    expect(submission).toEqual({ providerTaskId: "suno-123", providerTraceId: null });
  });

  it("propagates a malformed response as a thrown error", async () => {
    const client = fakeClient({ foo: "bar" });
    const service = new SunoSongService(client);

    await expect(
      service.submitGeneration({ lyrics: "Title\n...", moodName: "Joyful", sunoPrompt: "..." }),
    ).rejects.toThrow();
  });
});

describe("SunoSongService.pollGenerationStatus", () => {
  it("returns the already-known result for a task submitted by this same instance", async () => {
    const client = fakeClient({
      id: "suno-123",
      audio_url: "https://cdn.example.com/song.mp3",
      duration: 120,
    });
    const service = new SunoSongService(client);

    const submission = await service.submitGeneration({
      lyrics: "Title\n...",
      moodName: "Joyful",
      sunoPrompt: "upbeat joyful lullaby",
    });
    const result = await service.pollGenerationStatus(submission.providerTaskId);

    expect(result).toEqual({
      status: "completed",
      providerSongId: "suno-123",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });
  });

  it("returns pending for an unknown task id, without calling the client again", async () => {
    const client = fakeClient({});
    const service = new SunoSongService(client);

    const result = await service.pollGenerationStatus("never-submitted");

    expect(result).toEqual({ status: "pending" });
    expect(client.generate).not.toHaveBeenCalled();
  });
});
