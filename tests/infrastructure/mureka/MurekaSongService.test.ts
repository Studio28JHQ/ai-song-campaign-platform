import { describe, expect, it, vi } from "vitest";
import type { MurekaClient } from "@/infrastructure/mureka/MurekaClient";
import { MurekaSongService } from "@/infrastructure/mureka/MurekaSongService";

function fakeClient(raw: unknown): MurekaClient {
  return { submitGeneration: vi.fn().mockResolvedValue(raw) } as unknown as MurekaClient;
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
      moodName: "Joyful",
      sunoPrompt: "upbeat joyful lullaby",
    });

    expect(client.submitGeneration).toHaveBeenCalledTimes(1);
    expect(client.submitGeneration).toHaveBeenCalledWith({
      lyrics: "Title\n...",
      model: "auto",
      prompt: "upbeat joyful lullaby",
      n: 1,
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
      service.submitGeneration({ lyrics: "Title\n...", moodName: "Joyful", sunoPrompt: "..." }),
    ).rejects.toThrow();
  });

  it("propagates a client-level failure (e.g. an authentication or rate-limit error) unchanged", async () => {
    const client: MurekaClient = {
      submitGeneration: vi.fn().mockRejectedValue(new Error("Mureka API rejected the request.")),
    } as unknown as MurekaClient;
    const service = new MurekaSongService(client);

    await expect(
      service.submitGeneration({ lyrics: "Title\n...", moodName: "Joyful", sunoPrompt: "..." }),
    ).rejects.toThrow("Mureka API rejected the request.");
  });
});
