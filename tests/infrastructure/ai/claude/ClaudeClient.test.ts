import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeClient } from "@/infrastructure/ai/claude/ClaudeClient";

describe("ClaudeClient.sendMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
