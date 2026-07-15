import { z } from "zod";
import { ExternalApiError } from "@/shared/errors";
import type { MurekaSubmissionResult } from "./types";

/**
 * Mureka's documented submission response shape:
 * `{ id, created_at, model, status, trace_id }` — see
 * https://platform.mureka.ai/docs/en/quickstart.html. `id` and
 * `trace_id` are accepted as either a string or a number since the
 * official example renders `id` as a bare numeric-looking token; both
 * are normalized to strings, matching `providerTaskId`/`providerTraceId`'s
 * shape everywhere else in this codebase.
 */
const murekaSubmissionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  created_at: z.number(),
  status: z.string().min(1),
  trace_id: z.union([z.string(), z.number()]).nullable().optional(),
});

/**
 * Parses and validates Mureka's `POST /v1/song/generate` response into
 * the structured submission result `MurekaSongService` maps into the
 * shared provider abstraction. Throws the shared `ExternalApiError` for
 * any malformed or unexpected shape — no raw Mureka payload or parsing
 * exception ever escapes this class (see
 * docs/Architecture/External_Services.md — "Mureka API").
 */
export class ResponseParser {
  static parse(raw: unknown): MurekaSubmissionResult {
    const result = murekaSubmissionSchema.safeParse(raw);

    if (!result.success) {
      throw new ExternalApiError("Mureka response did not match the expected schema.", {
        code: "mureka.malformed_response",
        context: { issues: result.error.issues },
      });
    }

    const data = result.data;

    return {
      providerTaskId: String(data.id),
      providerTraceId: data.trace_id != null ? String(data.trace_id) : null,
      // Mureka's `created_at` is a Unix timestamp in seconds.
      submittedAt: new Date(data.created_at * 1000),
      providerStatus: data.status,
    };
  }
}
