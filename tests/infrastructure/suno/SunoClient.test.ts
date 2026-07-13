import { afterEach, describe, expect, it, vi } from "vitest";
import { SunoClient } from "@/infrastructure/suno/SunoClient";

describe("SunoClient.generate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const payload = {
    prompt: "upbeat joyful lullaby",
    lyrics: "Title\n...",
    tags: "Joyful",
    title: "Title",
  };

  it("sends the expected request and returns the parsed body, without ever hitting a real network", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "suno-123", audio_url: "https://cdn.example.com/song.mp3" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SunoClient();
    const result = await client.generate(payload);

    expect(result).toEqual({ id: "suno-123", audio_url: "https://cdn.example.com/song.mp3" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.suno.ai/v1/generate");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer /);

    const body = JSON.parse(init.body as string);
    expect(body.prompt).toBe("upbeat joyful lullaby");
    expect(body.lyrics).toBe("Title\n...");
    expect(body.tags).toBe("Joyful");
    expect(body.title).toBe("Title");
  });

  it("throws a shared error on a non-ok response, without retrying (4xx is not retried)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthorized" }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SunoClient();

    await expect(client.generate(payload)).rejects.toThrow();
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

    const client = new SunoClient();
    await expect(client.generate(payload)).rejects.toThrow();
  });
});
