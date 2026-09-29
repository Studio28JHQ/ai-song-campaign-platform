import { describe, expect, it } from "vitest";
import { ResponseParser } from "@/infrastructure/lyria/ResponseParser";
import { ExternalApiError } from "@/shared/errors";

/** The shape a real Lyria response has — verified live before this adapter was written. */
function lyriaResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "interactions/abc-123",
    model: "lyria-3.5",
    status: "completed",
    output_audio: {
      type: "audio",
      mime_type: "audio/mpeg",
      data: Buffer.from("fake-mp3-bytes").toString("base64"),
    },
    ...overrides,
  };
}

describe("Lyria ResponseParser.parse", () => {
  it("maps a finished generation into an immediate submission with decoded bytes", () => {
    const result = ResponseParser.parse(lyriaResponse());

    expect(result.kind).toBe("immediate");
    if (result.kind !== "immediate") throw new Error("unreachable");

    expect(result.providerSongId).toBe("interactions/abc-123");
    expect(result.audio.contentType).toBe("audio/mpeg");
    expect(Buffer.from(result.audio.bytes).toString("utf8")).toBe("fake-mp3-bytes");
  });

  it("decodes real base64 audio into the exact same bytes", () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0xff, 0xfb]);
    const result = ResponseParser.parse(
      lyriaResponse({
        output_audio: {
          type: "audio",
          mime_type: "audio/mpeg",
          data: Buffer.from(bytes).toString("base64"),
        },
      }),
    );

    if (result.kind !== "immediate") throw new Error("unreachable");
    expect(Array.from(result.audio.bytes)).toEqual(Array.from(bytes));
  });

  it("falls back to audio/mpeg when the response omits a mime type", () => {
    const result = ResponseParser.parse(
      lyriaResponse({ output_audio: { type: "audio", data: Buffer.from("x").toString("base64") } }),
    );

    if (result.kind !== "immediate") throw new Error("unreachable");
    expect(result.audio.contentType).toBe("audio/mpeg");
  });

  it("still completes when the response carries no interaction id — the song was generated and paid for", () => {
    const result = ResponseParser.parse(lyriaResponse({ id: undefined }));

    if (result.kind !== "immediate") throw new Error("unreachable");
    expect(result.providerSongId).toBe("lyria-interaction");
  });

  it.each([
    ["no audio block at all", { output_audio: undefined }],
    ["an audio block with no data", { output_audio: { type: "audio", mime_type: "audio/mpeg" } }],
    ["an empty data string", { output_audio: { type: "audio", data: "" } }],
  ])("rejects a response with %s", (_label, overrides) => {
    expect(() => ResponseParser.parse(lyriaResponse(overrides))).toThrow(ExternalApiError);
  });

  it("classifies a malformed response under a Lyria-specific error code", () => {
    try {
      ResponseParser.parse({ nonsense: true });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalApiError);
      expect((error as ExternalApiError).code).toBe("lyria.malformed_response");
    }
  });
});
