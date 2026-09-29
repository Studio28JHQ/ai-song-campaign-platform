import { appConfig } from "@/config/app";
import { ExternalApiError } from "@/shared/errors";
import { httpRequest } from "@/shared/http";
import type { MurekaGenerateRequest } from "./types";

const MUREKA_BASE_URL = "https://api.mureka.ai";
const MUREKA_GENERATE_PATH = "/v1/song/generate";
const MUREKA_QUERY_PATH = "/v1/song/query";
const MUREKA_BILLING_PATH = "/v1/account/billing";

/**
 * Which call failed. Mureka reuses HTTP 400 across endpoints for causes
 * that have nothing to do with each other, so the mapping below cannot
 * be read from the status alone.
 */
type MurekaOperation = "submit" | "query" | "billing";

/**
 * Minimal HTTP client for Mureka's official asynchronous song
 * generation endpoints — talks to Mureka and nothing else, built on the
 * shared `httpRequest` helper (`src/shared/http/`) rather than a vendor
 * SDK or an unofficial wrapper, the same pattern as
 * `ClaudeClient`/`ResendClient`. Adds a bearer token (from
 * `appConfig.mureka.apiKey`). Network errors and timeouts are retried
 * transparently by `httpRequest`.
 *
 * Gate 9.2 added submission; Gate 9.3 adds polling via the official
 * task-query endpoint (`queryTask`) — see
 * https://platform.mureka.ai/docs/api/operations/get-v1-song-query-%7Btask_id%7D.html.
 */
export class MurekaClient {
  async submitGeneration(payload: MurekaGenerateRequest): Promise<unknown> {
    const response = await httpRequest(`${MUREKA_BASE_URL}${MUREKA_GENERATE_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${appConfig.mureka.apiKey}`,
      },
      body: JSON.stringify(payload),
      // A generation submission is never retried automatically. The shared
      // helper's default (2 retries on a timeout or a 5xx) is safe for the
      // idempotent calls in this codebase, but not for this one: Mureka may
      // have accepted the request and started a *billable* generation
      // before the response failed to reach us, and a blind retry would
      // pay for the same song twice while only the last task id is ever
      // recorded. Mureka publishes no idempotency key, so the only correct
      // behaviour is a single attempt; a genuine retry is an explicit
      // pipeline decision (the admin retry flow), never an HTTP-layer one.
      retries: 0,
    });

    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw MurekaClient.mapErrorResponse(response.status, details, "submit");
    }

    return MurekaClient.parseJsonBody(response);
  }

  /** Polls Mureka's official task-query endpoint for a previously submitted generation job. */
  async queryTask(taskId: string): Promise<unknown> {
    const response = await httpRequest(
      `${MUREKA_BASE_URL}${MUREKA_QUERY_PATH}/${encodeURIComponent(taskId)}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${appConfig.mureka.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw MurekaClient.mapErrorResponse(response.status, details, "query");
    }

    return MurekaClient.parseJsonBody(response);
  }

  /**
   * Queries Mureka's official account-billing endpoint (RC-2 —
   * Production Hardening). A free, read-only GET, unrelated to
   * generation credits — used only as a connectivity/authentication
   * check for `GET /api/internal/health`, never in the generation
   * pipeline itself.
   */
  async getAccountBilling(): Promise<unknown> {
    const response = await httpRequest(`${MUREKA_BASE_URL}${MUREKA_BILLING_PATH}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${appConfig.mureka.apiKey}`,
      },
    });

    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw MurekaClient.mapErrorResponse(response.status, details, "billing");
    }

    return MurekaClient.parseJsonBody(response);
  }

  private static async parseJsonBody(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (cause) {
      throw new ExternalApiError("Mureka API response body was not valid JSON.", {
        code: "mureka.invalid_response_body",
        cause,
      });
    }
  }

  /**
   * Maps Mureka's documented error codes
   * (https://platform.mureka.ai/docs/en/error-codes.html) to the shared
   * `ExternalApiError` taxonomy. 429 covers two distinct causes — rate
   * limiting and exhausted credits — that only differ in the response
   * body's message, never the status code alone, so the body is
   * inspected to tell them apart.
   */
  private static mapErrorResponse(
    status: number,
    details: unknown,
    operation: MurekaOperation,
  ): ExternalApiError {
    const context = { status, details, operation };
    const reported = MurekaClient.describeProviderError(details);

    if (status === 401) {
      return new ExternalApiError("Mureka API rejected the request: invalid authentication.", {
        code: "mureka.invalid_authentication",
        context,
      });
    }

    if (status === 403) {
      return new ExternalApiError(
        "Mureka API rejected the request: forbidden (unsupported region).",
        { code: "mureka.forbidden", context },
      );
    }

    if (status === 429) {
      const message = MurekaClient.extractErrorMessage(details);
      const isQuotaExceeded = message !== null && /credit|quota/i.test(message);

      return new ExternalApiError(
        isQuotaExceeded
          ? "Mureka API rejected the request: quota exceeded."
          : "Mureka API rejected the request: rate limit reached.",
        { code: isQuotaExceeded ? "mureka.quota_exceeded" : "mureka.rate_limited", context },
      );
    }

    if (status === 400) {
      // Mureka answers 400 for two unrelated things, and collapsing them
      // sent a real investigation down the wrong path: a song whose
      // submission Mureka had *accepted* (it returned a task id, and the
      // lyrics were 318 characters, well inside every limit) was recorded
      // as "invalid payload" because the later *poll* returned 400.
      //
      // On the generation endpoint a 400 really is our request being
      // malformed. On the query endpoint it means the task id is unknown
      // to the authenticated account — verified live when this
      // integration shipped, with a deliberately non-existent id (see
      // docs/Architecture/External_Services.md, "Live validation"). The
      // payload is not even part of that call, which takes no body.
      if (operation === "query") {
        return new ExternalApiError(
          MurekaClient.withReported(
            "Mureka does not recognise this task id for the authenticated account.",
            reported,
          ),
          { code: "mureka.task_not_found", context },
        );
      }

      return new ExternalApiError(
        MurekaClient.withReported("Mureka API rejected the request: invalid payload.", reported),
        { code: "mureka.invalid_request", context },
      );
    }

    if (status >= 500) {
      return new ExternalApiError("Mureka API responded with a server error.", {
        code: "mureka.server_error",
        context,
      });
    }

    return new ExternalApiError(`Mureka API responded with status ${status}.`, {
      code: "mureka.api_error",
      context,
    });
  }

  private static extractErrorMessage(details: unknown): string | null {
    const message = (details as { error?: { message?: unknown } } | null)?.error?.message;
    return typeof message === "string" ? message : null;
  }

  /**
   * Mureka's own explanation, ready to be recorded next to ours.
   *
   * It was already being captured into the error's `context`, but
   * nothing downstream reads that: `Song.markFailed` stores the message
   * and `classifyPollFailure` logs the message, so the provider's actual
   * words were reaching the database as a discarded object. Folding them
   * into the message is what turns "invalid payload" from a guess into
   * something the campaign team can act on.
   *
   * Truncated, and scrubbed of the API key: Mureka has never echoed a
   * credential back, but this string now lands in `songs.providerError`
   * and is shown in the admin panel, so it is not the place to find out.
   */
  private static describeProviderError(details: unknown): string | null {
    const message =
      MurekaClient.extractErrorMessage(details) ??
      (typeof (details as { message?: unknown } | null)?.message === "string"
        ? (details as { message: string }).message
        : null);

    const trimmed = message?.trim();
    if (!trimmed) return null;

    const apiKey = appConfig.mureka.apiKey;
    const scrubbed = apiKey ? trimmed.split(apiKey).join("[redacted]") : trimmed;

    return scrubbed.slice(0, 200);
  }

  /** Appends Mureka's own wording to ours, when there is any. */
  private static withReported(message: string, reported: string | null): string {
    return reported ? `${message} Mureka reported: "${reported}".` : message;
  }
}
