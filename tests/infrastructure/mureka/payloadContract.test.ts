import { describe, expect, it, vi } from "vitest";
import type { SongGenerationInput } from "@/application/song/contracts/SongGenerationProvider";
import { MurekaClient } from "@/infrastructure/mureka/MurekaClient";
import { ExternalApiError } from "@/shared/errors";
import { MurekaSongService } from "@/infrastructure/mureka/MurekaSongService";
import { MUREKA_MODEL, MUREKA_STYLE, PromptBuilder } from "@/infrastructure/mureka/PromptBuilder";
import type { MurekaGenerateRequest } from "@/infrastructure/mureka/types";

/**
 * The payload contract, pinned against a real production failure.
 *
 * On 2026-09-29 a song was recorded as "Mureka API rejected the request:
 * invalid payload" and the investigation started, reasonably, at the
 * payload. The record said otherwise: the song had a `providerTaskId`
 * and a `submittedAt`, which only exist once Mureka has *accepted* a
 * submission. The 400 came from the later poll, where the payload is not
 * even part of the call.
 *
 * These tests hold both halves of that in place: the submission payload
 * built from an approved lyric is exactly what the configured endpoint
 * and model expect, and a 400 from the query endpoint is never again
 * described as a payload problem.
 */

/**
 * Structurally identical to the lyric that failed — the same section
 * tags, the same shape, the same 318 characters, the length the parser's
 * 360-character maximum is designed to allow — with a synthetic name, so
 * no real family's song text lives in the repository.
 */
const APPROVED_LYRICS = `[Verse]
Nora abre los ojos y ríe al sol,
buscando con sus manos un nuevo primor.

[Verse]
Gatea despacito, alcanza un juguete,
y mira a mamá con su carita alegre.

[Chorus]
Nora, Nora, qué alegría eres tú,
cada risa tuya es pura luz.

[Ending]
Crece feliz, envuelta en ternura,
Sensyderm Baby cuida su piel con dulzura.`;

function inputWith(overrides: Partial<SongGenerationInput> = {}): SongGenerationInput {
  return {
    lyrics: APPROVED_LYRICS,
    musicMood: "Joyful, bouncy and affectionate",
    musicDirection:
      "Playful acoustic arrangement with bright ukulele, light percussion and a bouncy, sing-along melody.",
    voice: "FEMALE",
    ...overrides,
  } as SongGenerationInput;
}

describe("Mureka submission payload", () => {
  it("[1][5] builds every field the configured contract requires, and nothing else", () => {
    const payload = PromptBuilder.build(inputWith());

    expect(payload).toEqual({
      lyrics: APPROVED_LYRICS,
      prompt: MUREKA_STYLE,
      model: "mureka-9",
      n: 1,
      gender: "female",
      stream: false,
    } satisfies MurekaGenerateRequest);

    expect(Object.keys(payload).sort()).toEqual([
      "gender",
      "lyrics",
      "model",
      "n",
      "prompt",
      "stream",
    ]);
  });

  it("[2] passes the section tags through byte for byte", () => {
    const payload = PromptBuilder.build(inputWith());

    // The exact structure Claude produces, unedited: two verses, a
    // chorus, and the closing section carrying the brand line.
    expect(payload.lyrics).toBe(APPROVED_LYRICS);
    expect(payload.lyrics).toContain("[Verse]");
    expect(payload.lyrics).toContain("[Chorus]");
    expect(payload.lyrics).toContain("[Ending]");
    expect(payload.lyrics.match(/\[Verse\]/g)).toHaveLength(2);
    expect(payload.lyrics).toContain("Sensyderm Baby");
    // Accents and newlines survive; nothing normalises or re-encodes them.
    expect(payload.lyrics).toContain("ríe");
    expect(payload.lyrics.split("\n\n")).toHaveLength(4);
  });

  it("[6][7] leaves no field undefined, null or empty, and every type is right", () => {
    for (const voice of ["FEMALE", "MALE"] as const) {
      const payload = PromptBuilder.build(inputWith({ voice }));

      for (const [key, value] of Object.entries(payload)) {
        expect(value, `${key} must be defined`).toBeDefined();
        expect(value, `${key} must not be null`).not.toBeNull();
      }

      expect(typeof payload.lyrics).toBe("string");
      expect(payload.lyrics.length).toBeGreaterThan(0);
      expect(typeof payload.prompt).toBe("string");
      expect(payload.prompt.length).toBeGreaterThan(0);
      expect(typeof payload.model).toBe("string");
      expect(typeof payload.n).toBe("number");
      expect(Number.isInteger(payload.n)).toBe(true);
      expect(typeof payload.stream).toBe("boolean");
      expect(["male", "female"]).toContain(payload.gender);
    }
  });

  it("[3][4] sends the pinned model and a prompt within Mureka's documented 1024-character limit", () => {
    const payload = PromptBuilder.build(inputWith());

    expect(payload.model).toBe(MUREKA_MODEL);
    expect(payload.model).toBe("mureka-9");
    expect(payload.prompt.length).toBeLessThanOrEqual(1024);
    // The style is a musical brief, never a copy of the lyrics.
    expect(payload.prompt).not.toContain(APPROVED_LYRICS);
  });

  it("[8] serialises to the exact JSON structure the endpoint receives", () => {
    const payload = PromptBuilder.build(inputWith());
    const body = JSON.stringify(payload);

    expect(JSON.parse(body)).toEqual(payload);
    // No undefined field silently disappears during serialisation.
    expect(Object.keys(JSON.parse(body))).toHaveLength(6);
    expect(body).toContain('"model":"mureka-9"');
    expect(body).toContain('"n":1');
    expect(body).toContain('"stream":false');
  });

  it("a lyric the size of the 2026-09-29 failure builds a valid payload", () => {
    // The point of the whole investigation: this payload was never the
    // problem. The real lyric was 318 characters — comfortably inside the
    // 360-character maximum, and well under the 261-360 range of the 346
    // songs that completed in the same two days. Mureka accepted it and
    // returned a task id.
    expect(APPROVED_LYRICS.length).toBeGreaterThan(300);
    expect(APPROVED_LYRICS.length).toBeLessThanOrEqual(360);

    const payload = PromptBuilder.build(inputWith());

    expect(payload.lyrics.length).toBe(APPROVED_LYRICS.length);
    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(payload.model).toBe("mureka-9");
  });
});

describe("Mureka 400 handling", () => {
  const originalFetch = global.fetch;

  function respondWith(status: number, body: unknown) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Headers({ "content-type": "application/json" }),
    }) as unknown as typeof fetch;
  }

  it("[9] still calls a 400 on the generation endpoint an invalid payload", async () => {
    respondWith(400, { error: { message: "lyrics is required" } });

    await expect(
      new MurekaClient().submitGeneration(PromptBuilder.build(inputWith())),
    ).rejects.toMatchObject({ code: "mureka.invalid_request" });

    global.fetch = originalFetch;
  });

  it("carries Mureka's own explanation into the message, instead of discarding it", async () => {
    respondWith(400, { error: { message: "lyrics is required" } });

    let thrown: unknown;
    try {
      await new MurekaClient().submitGeneration(PromptBuilder.build(inputWith()));
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).message).toContain("invalid payload");
    // Before this, the provider's words were captured into the error
    // context and then dropped by everything downstream.
    expect((thrown as Error).message).toContain("lyrics is required");

    global.fetch = originalFetch;
  });

  it("no longer calls a 400 on the query endpoint an invalid payload", async () => {
    // The real failure: the submission had already been accepted, so the
    // payload could not possibly have been the cause.
    respondWith(400, { error: { message: "task not found" } });

    let thrown: unknown;
    try {
      await new MurekaClient().queryTask("163616584171521");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: "mureka.task_not_found" });
    expect((thrown as Error).message).toContain("does not recognise this task id");
    expect((thrown as Error).message).not.toContain("invalid payload");
    expect((thrown as Error).message).toContain("task not found");

    global.fetch = originalFetch;
  });

  it("never echoes the API key back into an error message", async () => {
    const { appConfig } = await import("@/config/app");
    respondWith(400, { error: { message: `rejected for key ${appConfig.mureka.apiKey}` } });

    let thrown: unknown;
    try {
      await new MurekaClient().queryTask("163616584171521");
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).message).not.toContain(appConfig.mureka.apiKey);
    expect((thrown as Error).message).toContain("[redacted]");

    global.fetch = originalFetch;
  });
});

describe("Mureka poll failure classification", () => {
  it("fails the song without retrying when the task id is unknown, with an accurate reason", async () => {
    const client = {
      queryTask: vi
        .fn()
        .mockRejectedValue(
          new ExternalApiError(
            "Mureka does not recognise this task id for the authenticated account.",
            { code: "mureka.task_not_found" },
          ),
        ),
    } as unknown as MurekaClient;

    const result = await new MurekaSongService(client).pollGenerationStatus("163616584171521");

    // Unchanged behaviour — an unknown task will not become known by
    // asking again — with a message that now points at the real cause.
    expect(result.status).toBe("failed");
    expect(result).toMatchObject({ error: expect.stringContaining("does not recognise") });
  });

  it("keeps retrying the transient failures, exactly as before", async () => {
    for (const code of ["mureka.server_error", "mureka.rate_limited", "http_request_failed"]) {
      const client = {
        queryTask: vi.fn().mockRejectedValue(new ExternalApiError("boom", { code })),
      } as unknown as MurekaClient;

      const result = await new MurekaSongService(client).pollGenerationStatus("task-1");

      expect(result.status).toBe("pending");
    }
  });
});
