import type {
  SongGenerationInput,
  SongGenerationPollResult,
  SongGenerationProvider,
} from "@/application/song/contracts/SongGenerationProvider";
import { ExternalApiError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import { MurekaClient } from "./MurekaClient";
import { PromptBuilder } from "./PromptBuilder";
import { ResponseParser } from "./ResponseParser";
import type { MurekaSubmissionResult } from "./types";

/**
 * `ExternalApiError` codes that represent a temporary, provider-side
 * hiccup — a busy/overloaded Mureka, a rate limit, or a network/timeout
 * failure `httpRequest` couldn't recover from after its own retries.
 * `pollGenerationStatus` treats these as `{ status: "pending" }` so
 * `GenerationPoller` simply asks again on its next run, exactly like an
 * in-progress task. Every other `ExternalApiError` code (bad
 * credentials, exhausted quota, a malformed payload/response) reflects
 * something retrying won't fix, so it is reported as `{ status: "failed" }`
 * instead (Gate 9.3 — Mureka Polling).
 */
const RETRYABLE_ERROR_CODES = new Set([
  "mureka.server_error",
  "mureka.rate_limited",
  "http_request_failed",
]);

/**
 * Official Mureka async music generation provider — the active
 * `SongGenerationProvider` for the live pipeline as of the final
 * pre-beta provider switch. Orchestrates the three classes above:
 * build payload → call Mureka → parse response, the same shape
 * `ClaudeLyricsService` uses for its own external call.
 *
 * `submitGeneration` returns `MurekaSubmissionResult`, a strict
 * superset of `SongGenerationSubmission` (adds `submittedAt`,
 * `providerStatus`), so it satisfies the port's declared return type
 * structurally without a separate mapping step.
 */
export class MurekaSongService implements SongGenerationProvider {
  constructor(private readonly client: MurekaClient = new MurekaClient()) {}

  async submitGeneration(input: SongGenerationInput): Promise<MurekaSubmissionResult> {
    const payload = PromptBuilder.build(input);
    const raw = await this.client.submitGeneration(payload);
    const result = ResponseParser.parse(raw);

    logger.info("Mureka accepted a song generation submission", {
      providerTaskId: result.providerTaskId,
      providerTraceId: result.providerTraceId,
      submittedAt: result.submittedAt.toISOString(),
      providerStatus: result.providerStatus,
    });

    return result;
  }

  /**
   * Polls Mureka's task-query endpoint. Deliberately never throws for
   * an expected failure category (see `RETRYABLE_ERROR_CODES` above) —
   * `GenerationPoller` calls this once per run and must always get back
   * a `SongGenerationPollResult` to act on, not an exception to handle
   * itself. Does not download audio, upload to storage, or send email —
   * that remains `GenerationPoller`'s job, out of scope for this gate.
   */
  async pollGenerationStatus(providerTaskId: string): Promise<SongGenerationPollResult> {
    let raw: unknown;
    try {
      raw = await this.client.queryTask(providerTaskId);
    } catch (error) {
      return this.classifyPollFailure(providerTaskId, error);
    }

    try {
      return ResponseParser.parsePoll(raw);
    } catch (error) {
      return this.classifyPollFailure(providerTaskId, error);
    }
  }

  private classifyPollFailure(providerTaskId: string, error: unknown): SongGenerationPollResult {
    const code = error instanceof ExternalApiError ? error.code : undefined;
    const message = error instanceof Error ? error.message : String(error);

    if (code && RETRYABLE_ERROR_CODES.has(code)) {
      logger.warn("Mureka poll failed with a retryable error; will retry on next poll", {
        providerTaskId,
        code,
        message,
      });
      return { status: "pending" };
    }

    logger.error("Mureka poll failed with a non-retryable error", {
      providerTaskId,
      code,
      message,
    });
    return { status: "failed", error: message };
  }
}
