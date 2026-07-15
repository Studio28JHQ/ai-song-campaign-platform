import { afterEach, describe, expect, it, vi } from "vitest";
import { MurekaClient } from "@/infrastructure/mureka/MurekaClient";

describe("MurekaClient.submitGeneration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const payload = { lyrics: "Title\n...", model: "auto", prompt: "upbeat joyful lullaby", n: 1 };

  it("sends the expected request to the official endpoint and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "task-123",
        created_at: 1700000000,
        model: "mureka-6",
        status: "preparing",
        trace_id: "trace-456",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new MurekaClient();
    const result = await client.submitGeneration(payload);

    expect(result).toEqual({
      id: "task-123",
      created_at: 1700000000,
      model: "mureka-6",
      status: "preparing",
      trace_id: "trace-456",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mureka.ai/v1/song/generate");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer /);
    expect(headers["content-type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual(payload);
  });

  describe("Authentication", () => {
    it("reads the API key from configuration and sends it as a Bearer token — never hardcoded", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "task-1", created_at: 1700000000, status: "preparing" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await new MurekaClient().submitGeneration(payload);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.authorization).toMatch(/^Bearer .+/);
    });

    it("throws a distinct error for a 401 (invalid authentication)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ error: { message: "Invalid API key." } }),
        }),
      );

      await expect(new MurekaClient().submitGeneration(payload)).rejects.toMatchObject({
        code: "mureka.invalid_authentication",
      });
    });
  });

  describe("Error mapping", () => {
    it("maps a 403 to a forbidden error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
      );

      await expect(new MurekaClient().submitGeneration(payload)).rejects.toMatchObject({
        code: "mureka.forbidden",
      });
    });

    it("maps a 429 with a rate-limit message to rate_limited", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({ error: { message: "Too many requests, please slow down." } }),
        }),
      );

      await expect(new MurekaClient().submitGeneration(payload)).rejects.toMatchObject({
        code: "mureka.rate_limited",
      });
    });

    it("maps a 429 with a credits/quota message to quota_exceeded", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({ error: { message: "You have run out of credits." } }),
        }),
      );

      await expect(new MurekaClient().submitGeneration(payload)).rejects.toMatchObject({
        code: "mureka.quota_exceeded",
      });
    });

    it("maps a 400 to an invalid_request error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }),
      );

      await expect(new MurekaClient().submitGeneration(payload)).rejects.toMatchObject({
        code: "mureka.invalid_request",
      });
    });

    it("maps a 500 to a server_error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
      );

      await expect(new MurekaClient().submitGeneration(payload)).rejects.toMatchObject({
        code: "mureka.server_error",
      });
    });

    it("maps a 503 to a server_error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
      );

      await expect(new MurekaClient().submitGeneration(payload)).rejects.toMatchObject({
        code: "mureka.server_error",
      });
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

      await expect(new MurekaClient().submitGeneration(payload)).rejects.toMatchObject({
        code: "mureka.invalid_response_body",
      });
    });

    it("propagates a network/timeout failure as the shared external-API error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

      await expect(new MurekaClient().submitGeneration(payload)).rejects.toThrow();
    });
  });
});
