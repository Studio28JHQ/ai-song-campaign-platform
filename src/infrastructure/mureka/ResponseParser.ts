import { z } from "zod";
import type { SongGenerationPollResult } from "@/application/song/contracts/SongGenerationProvider";
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
 * Mureka's documented `SongTask` schema, returned by
 * `GET /v1/song/query/{task_id}` — confirmed against Mureka's own
 * published OpenAPI spec (see
 * https://platform.mureka.ai/docs/api/operations/get-v1-song-query-%7Btask_id%7D.html).
 * `status` is a documented, closed enum, but is parsed as a plain
 * non-empty string (not `z.enum(...)`) so a status value Mureka adds in
 * the future degrades to "pending" (see `parsePoll`) instead of making
 * every response for that status unparseable. `choices` (the generated
 * song(s)) is only populated once `status` is `"succeeded"`; each
 * choice's `duration` is in milliseconds per Mureka's docs, converted
 * to whole seconds here to match this codebase's `Song.duration`
 * convention (see `Song` — the same convention Suno's adapter already
 * follows).
 */
const murekaTaskSchema = z.object({
  id: z.union([z.string(), z.number()]),
  status: z.string().min(1),
  failed_reason: z.string().nullable().optional(),
  choices: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        url: z.string().optional(),
        duration: z.number().nullable().optional(),
      }),
    )
    .optional(),
});

const MUREKA_SUCCEEDED_STATUS = "succeeded";
const MUREKA_TERMINAL_FAILURE_STATUSES = new Set(["failed", "timeouted", "cancelled"]);

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

  /**
   * Parses and validates Mureka's `GET /v1/song/query/{task_id}`
   * response into the shared provider-agnostic poll result (Gate 9.3 —
   * Mureka Polling). Never downloads audio or reaches outside this
   * class — `ready_to_download` still only carries Mureka's own
   * short-lived `url`, exactly like `completed` does for Suno; it is
   * `GenerationPoller`'s job, not this one, to do anything with it.
   *
   * An unrecognized `status` string is deliberately treated as
   * `"pending"` rather than thrown: Mureka's status enum is documented
   * but not contractually frozen, and a still-in-progress job is a far
   * safer default than surfacing a hard failure for a job that may well
   * still complete.
   */
  static parsePoll(raw: unknown): SongGenerationPollResult {
    const result = murekaTaskSchema.safeParse(raw);

    if (!result.success) {
      throw new ExternalApiError("Mureka query response did not match the expected schema.", {
        code: "mureka.malformed_response",
        context: { issues: result.error.issues },
      });
    }

    const data = result.data;

    if (data.status === MUREKA_SUCCEEDED_STATUS) {
      const song = data.choices?.[0];
      if (!song?.url) {
        throw new ExternalApiError("Mureka reported a succeeded task without a playable song.", {
          code: "mureka.malformed_response",
          context: { taskId: String(data.id) },
        });
      }

      return {
        status: "ready_to_download",
        providerSongId: song.id != null ? String(song.id) : String(data.id),
        audioUrl: song.url,
        duration: song.duration != null ? Math.round(song.duration / 1000) : null,
        providerStatus: data.status,
      };
    }

    if (MUREKA_TERMINAL_FAILURE_STATUSES.has(data.status)) {
      return {
        status: "failed",
        error: data.failed_reason?.trim() || `Mureka reported task status "${data.status}".`,
      };
    }

    return { status: "pending", providerStatus: data.status };
  }
}
