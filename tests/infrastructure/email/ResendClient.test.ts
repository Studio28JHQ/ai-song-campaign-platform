import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendClient } from "@/infrastructure/email/ResendClient";

describe("ResendClient.send", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const payload = {
    from: "AI Song Campaign <no-reply@campaign.example.com>",
    to: "jane@example.com",
    subject: "Your personalized song is ready!",
    html: "<html></html>",
  };

  it("sends the expected request, without ever hitting a real network", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "email-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ResendClient();
    await client.send(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer /);

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe(payload.from);
    expect(body.to).toBe(payload.to);
    expect(body.subject).toBe(payload.subject);
    expect(body.html).toBe(payload.html);
  });

  it("throws a shared error on a non-ok response, without retrying (4xx is not retried)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: "unauthorized" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ResendClient();

    await expect(client.send(payload)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
