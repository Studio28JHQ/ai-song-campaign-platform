import { describe, expect, it, vi } from "vitest";
import { ExternalApiError } from "@/shared/errors";
import type { MurekaClient } from "@/infrastructure/mureka/MurekaClient";
import { MurekaSongService } from "@/infrastructure/mureka/MurekaSongService";

function fakeClient(raw: unknown): MurekaClient {
  return { submitGeneration: vi.fn().mockResolvedValue(raw) } as unknown as MurekaClient;
}

function fakePollingClient(result: unknown | Error): MurekaClient {
  return {
    queryTask:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
  } as unknown as MurekaClient;
}

describe("MurekaSongService.submitGeneration", () => {
  it("builds the prompt, calls the client once, and returns the parsed submission result", async () => {
    const client = fakeClient({
      id: "task-123",
      created_at: 1700000000,
      model: "mureka-6",
      status: "preparing",
      trace_id: "trace-456",
    });
    const service = new MurekaSongService(client);

    const result = await service.submitGeneration({
      lyrics: "Title\n...",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
    });

    expect(client.submitGeneration).toHaveBeenCalledTimes(1);
    expect(client.submitGeneration).toHaveBeenCalledWith({
      lyrics: "Title\n...",
      model: "auto",
      prompt: expect.stringContaining("Warm acoustic arrangement with gentle piano and ukulele."),
      n: 1,
      gender: "female",
      stream: false,
    });
    expect(result).toEqual({
      providerTaskId: "task-123",
      providerTraceId: "trace-456",
      submittedAt: new Date(1700000000 * 1000),
      providerStatus: "preparing",
    });
  });

  it("propagates a malformed response as a thrown error", async () => {
    const client = fakeClient({ foo: "bar" });
    const service = new MurekaSongService(client);

    await expect(
      service.submitGeneration({
        lyrics: "Title\n...",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement.",
        voice: "FEMALE",
      }),
    ).rejects.toThrow();
  });

  it("propagates a client-level failure (e.g. an authentication or rate-limit error) unchanged", async () => {
    const client: MurekaClient = {
      submitGeneration: vi.fn().mockRejectedValue(new Error("Mureka API rejected the request.")),
    } as unknown as MurekaClient;
    const service = new MurekaSongService(client);

    await expect(
      service.submitGeneration({
        lyrics: "Title\n...",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement.",
        voice: "FEMALE",
      }),
    ).rejects.toThrow("Mureka API rejected the request.");
  });
});

describe("MurekaSongService.pollGenerationStatus", () => {
  it("calls the client once and returns the parsed poll result on a still-in-progress task", async () => {
    const client = fakePollingClient({ id: "task-123", status: "running" });
    const service = new MurekaSongService(client);

    const result = await service.pollGenerationStatus("task-123");

    expect(client.queryTask).toHaveBeenCalledTimes(1);
    expect(client.queryTask).toHaveBeenCalledWith("task-123");
    expect(result).toEqual({ status: "pending", providerStatus: "running" });
  });

  it("returns ready_to_download on a succeeded task, without downloading or storing anything", async () => {
    const client = fakePollingClient({
      id: "task-123",
      status: "succeeded",
      choices: [{ id: "song-1", url: "https://cdn.mureka.ai/song-1.mp3", duration: 90000 }],
    });
    const service = new MurekaSongService(client);

    const result = await service.pollGenerationStatus("task-123");

    expect(result).toEqual({
      status: "ready_to_download",
      providerSongId: "song-1",
      audioUrl: "https://cdn.mureka.ai/song-1.mp3",
      duration: 90,
      providerStatus: "succeeded",
    });
  });

  it("returns failed with the provider's reason on a terminal failure status", async () => {
    const client = fakePollingClient({
      id: "task-123",
      status: "failed",
      failed_reason: "Generation could not complete.",
    });
    const service = new MurekaSongService(client);

    const result = await service.pollGenerationStatus("task-123");

    expect(result).toEqual({ status: "failed", error: "Generation could not complete." });
  });

  describe("client-level failures", () => {
    it.each([
      ["mureka.server_error", "server error"],
      ["mureka.rate_limited", "rate limited"],
      ["http_request_failed", "network/timeout"],
    ])("classifies %s as retryable (pending), never throwing", async (code, description) => {
      const client = fakePollingClient(
        new ExternalApiError(`Mureka failed: ${description}`, { code }),
      );
      const service = new MurekaSongService(client);

      const result = await service.pollGenerationStatus("task-123");

      expect(result).toEqual({ status: "pending" });
    });

    it.each([
      "mureka.invalid_authentication",
      "mureka.forbidden",
      "mureka.quota_exceeded",
      "mureka.invalid_request",
    ])("classifies %s as non-retryable (failed), never throwing", async (code) => {
      const client = fakePollingClient(
        new ExternalApiError("Mureka rejected the request.", { code }),
      );
      const service = new MurekaSongService(client);

      const result = await service.pollGenerationStatus("task-123");

      expect(result).toEqual({ status: "failed", error: "Mureka rejected the request." });
    });

    it("classifies a malformed response from the parser as non-retryable (failed), never throwing", async () => {
      const client = fakePollingClient({ status: "succeeded" }); // no choices — malformed for "succeeded"
      const service = new MurekaSongService(client);

      const result = await service.pollGenerationStatus("task-123");

      expect(result.status).toBe("failed");
    });

    it("classifies a completely unexpected error as non-retryable (failed), never throwing", async () => {
      const client = fakePollingClient(new Error("something unexpected happened"));
      const service = new MurekaSongService(client);

      const result = await service.pollGenerationStatus("task-123");

      expect(result).toEqual({ status: "failed", error: "something unexpected happened" });
    });
  });
});
