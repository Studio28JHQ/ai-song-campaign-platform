import { z } from "zod";
import { ExternalApiError } from "@/shared/errors";
import type { SunoApiResult } from "./types";

const sunoResponseSchema = z.object({
  id: z.string().min(1),
  audio_url: z.string().min(1),
  duration: z.number().positive().nullable().optional(),
});

/**
 * Parses and validates Suno's generation response into the structured
 * result `GenerateSongUseCase` expects. Throws the shared
 * `ExternalApiError` for any malformed or unexpected shape — no raw Suno
 * payload or parsing exception ever escapes this class (see
 * docs/Architecture/External_Services.md — "Suno API").
 */
export class ResponseParser {
  static parse(raw: unknown): SunoApiResult {
    const result = sunoResponseSchema.safeParse(raw);

    if (!result.success) {
      throw new ExternalApiError("Suno response did not match the expected schema.", {
        code: "suno.malformed_response",
        context: { issues: result.error.issues },
      });
    }

    return {
      providerSongId: result.data.id,
      audioUrl: result.data.audio_url,
      duration: result.data.duration ?? null,
    };
  }
}
