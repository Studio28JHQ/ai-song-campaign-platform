import { z } from "zod";
import type { SongGenerationSubmission } from "@/application/song/contracts/SongGenerationProvider";
import { ExternalApiError } from "@/shared/errors";

const DEFAULT_AUDIO_CONTENT_TYPE = "audio/mpeg";

/**
 * What this adapter requires from Lyria's `Interaction` response. The SDK's
 * own type marks every field optional (one `Interaction` shape covers
 * agents, text and streaming too), so the two things this pipeline cannot
 * work without — an interaction id and base64 audio — are asserted here
 * instead of trusted.
 *
 * Verified against a real response: `output_audio.mime_type` came back as
 * `"audio/mpeg"` and `output_audio.data` as a base64 MP3 (ID3 header,
 * 44.1 kHz stereo). `sample_rate`/`channels` were absent, so neither is
 * required.
 */
const lyriaInteractionSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  output_audio: z
    .object({
      data: z.string().min(1),
      mime_type: z.string().min(1).optional(),
    })
    .optional(),
});

/**
 * Turns Lyria's response into the shared `immediate` submission result.
 *
 * Lyria is synchronous: the audio is already finished and inline, so this
 * produces bytes, not a task id. Those bytes then go through exactly the
 * same `SongCompletionService` (FFmpeg → R2 → DB → email) as Mureka's, which
 * is what keeps the 60-second cap and the storage convention provider-
 * agnostic. This class never writes to storage, never sends anything, and
 * never inspects the audio beyond decoding it.
 */
export class ResponseParser {
  static parse(raw: unknown): SongGenerationSubmission {
    const result = lyriaInteractionSchema.safeParse(raw);

    if (!result.success) {
      throw new ExternalApiError("Lyria response did not match the expected schema.", {
        code: "lyria.malformed_response",
        context: { issues: result.error.issues },
      });
    }

    const audio = result.data.output_audio;

    if (!audio) {
      throw new ExternalApiError("Lyria returned no audio for this generation.", {
        code: "lyria.malformed_response",
        context: { reason: "missing_output_audio" },
      });
    }

    const bytes = ResponseParser.decodeBase64(audio.data);

    if (bytes.length === 0) {
      throw new ExternalApiError("Lyria returned empty audio for this generation.", {
        code: "lyria.malformed_response",
        context: { reason: "empty_audio" },
      });
    }

    return {
      kind: "immediate",
      // Lyria's interaction id is the closest equivalent to Mureka's
      // `providerSongId`. It is optional in the SDK's type, so a response
      // without one still completes: the generation is real and paid for,
      // and failing it over a missing diagnostic id would throw away a song.
      providerSongId: result.data.id != null ? String(result.data.id) : "lyria-interaction",
      audio: {
        bytes,
        contentType: audio.mime_type ?? DEFAULT_AUDIO_CONTENT_TYPE,
      },
    };
  }

  private static decodeBase64(data: string): Uint8Array {
    try {
      return new Uint8Array(Buffer.from(data, "base64"));
    } catch (cause) {
      throw new ExternalApiError("Lyria audio could not be decoded from base64.", {
        code: "lyria.malformed_response",
        cause,
        context: { reason: "undecodable_audio" },
      });
    }
  }
}
