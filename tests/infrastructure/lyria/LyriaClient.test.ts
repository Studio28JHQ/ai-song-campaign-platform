import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalApiError } from "@/shared/errors";

const FAKE_API_KEY = "test-gemini-key-never-logged";
const mockInteractionsCreate = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI() {
    return { interactions: { create: mockInteractionsCreate } };
  }),
}));

const mockApiKey = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("@/config/app", () => ({
  appConfig: {
    get lyria() {
      return { apiKey: mockApiKey.value };
    },
  },
}));

const { LyriaClient } = await import("@/infrastructure/lyria/LyriaClient");
const { GoogleGenAI } = await import("@google/genai");

describe("LyriaClient.generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiKey.value = FAKE_API_KEY;
    mockInteractionsCreate.mockResolvedValue({ id: "interactions/1" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls the Interactions API with the pinned model and the full prompt", async () => {
    const prompt = "Commercial social media baby-care jingle ...\n\n[Verse]\nLiam ...";

    await new LyriaClient().generate(prompt);

    expect(mockInteractionsCreate).toHaveBeenCalledTimes(1);
    const [params] = mockInteractionsCreate.mock.calls[0];
    expect(params).toEqual({ model: "lyria-3.5", input: prompt });
  });

  it("never retries a generation: a retried request is a second song paid for", async () => {
    await new LyriaClient().generate("prompt");

    const [, options] = mockInteractionsCreate.mock.calls[0];
    expect(options).toEqual({ maxRetries: 0 });
  });

  it("authenticates through the SDK, so the key never reaches a URL or query string", async () => {
    await new LyriaClient().generate("prompt");

    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: FAKE_API_KEY });
    // Nothing in the request itself carries the credential.
    expect(JSON.stringify(mockInteractionsCreate.mock.calls[0])).not.toContain(FAKE_API_KEY);
  });

  it("fails with a controlled error, and never constructs a client, when the key is absent", async () => {
    mockApiKey.value = undefined;

    await expect(new LyriaClient().generate("prompt")).rejects.toMatchObject({
      code: "lyria.missing_api_key",
    });
    expect(GoogleGenAI).not.toHaveBeenCalled();
    expect(mockInteractionsCreate).not.toHaveBeenCalled();
  });

  it("builds the SDK client once and reuses it across generations", async () => {
    const client = new LyriaClient();
    await client.generate("one");
    await client.generate("two");

    expect(GoogleGenAI).toHaveBeenCalledTimes(1);
    expect(mockInteractionsCreate).toHaveBeenCalledTimes(2);
  });

  it("classifies Google's content-policy refusal apart from a malformed request", async () => {
    // Google's real wording, captured from the live API when it refused a
    // production lyric.
    mockInteractionsCreate.mockRejectedValue(
      Object.assign(
        new Error(
          "400 Input blocked: The prompt could not be submitted. The prompt contains sensitive words that violate Google's Generative AI Prohibited Use policy.",
        ),
        { status: 400 },
      ),
    );

    await expect(new LyriaClient().generate("prompt")).rejects.toMatchObject({
      code: "lyria.content_blocked",
    });
  });

  it("keeps a plain malformed 400 as an invalid request, never a content block", async () => {
    mockInteractionsCreate.mockRejectedValue(
      Object.assign(new Error("400 Invalid value at 'input'"), { status: 400 }),
    );

    await expect(new LyriaClient().generate("prompt")).rejects.toMatchObject({
      code: "lyria.invalid_request",
    });
  });

  it("never echoes Google's refusal message, which quotes back part of the prompt", async () => {
    mockInteractionsCreate.mockRejectedValue(
      Object.assign(new Error("400 Input blocked: sensitive words"), { status: 400 }),
    );

    let thrown: unknown;
    try {
      await new LyriaClient().generate("prompt");
    } catch (error) {
      thrown = error;
    }

    const mapped = thrown as ExternalApiError;
    expect(mapped.message).not.toContain("Input blocked");
    expect(JSON.stringify(mapped.context ?? {})).not.toContain("sensitive words");
  });

  it.each([
    [401, "unauthorized", "lyria.invalid_authentication"],
    [403, "forbidden", "lyria.forbidden"],
    [400, "bad request", "lyria.invalid_request"],
    [500, "boom", "lyria.server_error"],
    [503, "unavailable", "lyria.server_error"],
    [429, "Quota exceeded for this project", "lyria.quota_exceeded"],
    [429, "Too many requests, slow down", "lyria.rate_limited"],
  ])("maps HTTP %s (%s) to %s", async (status, message, expectedCode) => {
    mockInteractionsCreate.mockRejectedValue(Object.assign(new Error(message), { status }));

    await expect(new LyriaClient().generate("prompt")).rejects.toMatchObject({
      code: expectedCode,
    });
  });

  it("treats a RESOURCE_EXHAUSTED status name as an exhausted quota", async () => {
    mockInteractionsCreate.mockRejectedValue(new Error("RESOURCE_EXHAUSTED: out of quota"));

    await expect(new LyriaClient().generate("prompt")).rejects.toMatchObject({
      code: "lyria.quota_exceeded",
    });
  });

  it("falls back to a generic provider error for an unrecognised failure", async () => {
    mockInteractionsCreate.mockRejectedValue(new Error("socket hang up"));

    await expect(new LyriaClient().generate("prompt")).rejects.toMatchObject({
      code: "lyria.api_error",
    });
  });

  it("never carries the API key into the error it raises", async () => {
    // A hostile worst case: the SDK error itself embeds the credential in its
    // message and attaches the request config that carried it.
    mockInteractionsCreate.mockRejectedValue(
      Object.assign(new Error(`request failed with key=${FAKE_API_KEY}`), {
        status: 500,
        config: { headers: { "x-goog-api-key": FAKE_API_KEY } },
        request: { url: `https://example.invalid/v1beta/interactions?key=${FAKE_API_KEY}` },
      }),
    );

    let thrown: unknown;
    try {
      await new LyriaClient().generate("prompt");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExternalApiError);
    const mapped = thrown as ExternalApiError;
    expect(mapped.message).not.toContain(FAKE_API_KEY);
    expect(JSON.stringify(mapped.context ?? {})).not.toContain(FAKE_API_KEY);
    // The original error is not attached as a cause either, so nothing
    // downstream (logs, `Song.providerError`) can serialise it back out.
    expect(JSON.stringify({ ...mapped, message: mapped.message })).not.toContain(FAKE_API_KEY);
    expect(mapped.code).toBe("lyria.server_error");
  });
});
