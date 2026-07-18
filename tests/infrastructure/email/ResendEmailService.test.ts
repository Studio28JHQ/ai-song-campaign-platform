import { describe, expect, it, vi } from "vitest";
import type { ResendClient } from "@/infrastructure/email/ResendClient";
import { ResendEmailService } from "@/infrastructure/email/ResendEmailService";

function fakeClient(): ResendClient {
  return { send: vi.fn().mockResolvedValue(undefined) } as unknown as ResendClient;
}

describe("ResendEmailService.sendSongReadyEmail", () => {
  const input = {
    to: "jane@example.com",
    parentName: "Jane Doe",
    babyName: "Baby Doe",
    songId: "song-1",
    audioUrl: "https://cdn.example.com/song.mp3",
    duration: 120,
  };

  it("builds the subject/html and calls the client exactly once", async () => {
    const client = fakeClient();
    const service = new ResendEmailService(client);

    await service.sendSongReadyEmail(input);

    expect(client.send).toHaveBeenCalledTimes(1);
    const payload = (client.send as ReturnType<typeof vi.fn>).mock.calls[0][0];

    expect(payload.to).toBe("jane@example.com");
    expect(payload.subject).toBe("¡Tu canción personalizada ya está lista!");
    expect(payload.html).toContain("Baby Doe");
    expect(payload.html).toContain("https://cdn.example.com/song.mp3");
  });

  it("propagates a client failure", async () => {
    const client = {
      send: vi.fn().mockRejectedValue(new Error("Resend API responded with status 500.")),
    } as unknown as ResendClient;
    const service = new ResendEmailService(client);

    await expect(service.sendSongReadyEmail(input)).rejects.toThrow();
  });
});
