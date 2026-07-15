import { appConfig } from "@/config/app";
import { ExternalApiError } from "@/shared/errors";
import { httpRequest } from "@/shared/http";
import type { MurekaGenerateRequest } from "./types";

const MUREKA_BASE_URL = "https://api.mureka.ai";
const MUREKA_GENERATE_PATH = "/v1/song/generate";
const MUREKA_QUERY_PATH = "/v1/song/query";
const MUREKA_BILLING_PATH = "/v1/account/billing";

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
    });

    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw MurekaClient.mapErrorResponse(response.status, details);
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
      throw MurekaClient.mapErrorResponse(response.status, details);
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
      throw MurekaClient.mapErrorResponse(response.status, details);
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
  private static mapErrorResponse(status: number, details: unknown): ExternalApiError {
    const context = { status, details };

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
      return new ExternalApiError("Mureka API rejected the request: invalid payload.", {
        code: "mureka.invalid_request",
        context,
      });
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
}
