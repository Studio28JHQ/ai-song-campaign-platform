import { describe, expect, it, vi } from "vitest";
import { LyriaSongService } from "@/infrastructure/lyria/LyriaSongService";
import type { LyriaClient } from "@/infrastructure/lyria/LyriaClient";
import type { SongGenerationProvider } from "@/application/song/contracts/SongGenerationProvider";
import { MUREKA_STYLE } from "@/infrastructure/mureka/PromptBuilder";
import { ExternalApiError } from "@/shared/errors";

const input = {
  lyrics: "[Verse]\nLiam abre los ojos y se pone a reír,\n\n[Ending]\ncon Sensyderm Baby.",
  musicMood: "Playful, warm and bouncy",
  musicDirection: "Upbeat acoustic children's arrangement with bright ukulele.",
  voice: "FEMALE" as const,
};

function fakeClient(response: unknown | Error): {
  client: LyriaClient;
  generate: ReturnType<typeof vi.fn>;
} {
  const generate =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  return { client: { generate } as unknown as LyriaClient, generate };
}

function audioResponse(): unknown {
  return {
    id: "interactions/abc-123",
    output_audio: {
      type: "audio",
      mime_type: "audio/mpeg",
      data: Buffer.from("mp3").toString("base64"),
    },
  };
}

describe("LyriaSongService", () => {
  it("declares the provider name and model that get persisted on the Song", () => {
    const service = new LyriaSongService(fakeClient(audioResponse()).client);

    expect(service.name).toBe("lyria");
    expect(service.model).toBe("lyria-3.5");
  });

  it("does not implement polling: its submissions are already finished", () => {
    const service: SongGenerationProvider = new LyriaSongService(
      fakeClient(audioResponse()).client,
    );

    // The port declares `pollGenerationStatus` optional precisely so a
    // synchronous provider can omit it instead of shipping a throwing stub.
    expect(service.pollGenerationStatus).toBeUndefined();
  });

  it("sends Lyria's own musical brief and the approved lyrics as one prompt", async () => {
    const { client, generate } = fakeClient(audioResponse());

    await new LyriaSongService(client).submitGeneration(input);

    expect(generate).toHaveBeenCalledTimes(1);
    const prompt = generate.mock.calls[0][0] as string;
    // Same musical intent as Mureka's, but not Mureka's text: its commercial
    // framing is refused by Google's safety filter when it accompanies a
    // lyric naming a small child (see `lyria/PromptBuilder`).
    expect(prompt).not.toContain(MUREKA_STYLE);
    expect(prompt).toContain("86 BPM");
    expect(prompt).toContain(input.lyrics);
  });

  it("returns an immediate submission whose bytes the pipeline can process", async () => {
    const { client } = fakeClient(audioResponse());

    const submission = await new LyriaSongService(client).submitGeneration(input);

    expect(submission.kind).toBe("immediate");
    if (submission.kind !== "immediate") throw new Error("unreachable");
    expect(submission.providerSongId).toBe("interactions/abc-123");
    expect(submission.audio.contentType).toBe("audio/mpeg");
    expect(submission.audio.bytes.length).toBeGreaterThan(0);
    // Nothing here uploads, processes or emails anything: the bytes go back
    // to the application layer, which runs the one shared audio pipeline.
    expect(Buffer.from(submission.audio.bytes).toString("utf8")).toBe("mp3");
  });

  it("propagates the client's classified error untouched, so the fallback policy can read its code", async () => {
    const { client } = fakeClient(new ExternalApiError("quota", { code: "lyria.quota_exceeded" }));

    await expect(new LyriaSongService(client).submitGeneration(input)).rejects.toMatchObject({
      code: "lyria.quota_exceeded",
    });
  });

  it("rejects a response with no audio rather than returning an empty submission", async () => {
    const { client } = fakeClient({ id: "interactions/abc-123" });

    await expect(new LyriaSongService(client).submitGeneration(input)).rejects.toMatchObject({
      code: "lyria.malformed_response",
    });
  });
});
