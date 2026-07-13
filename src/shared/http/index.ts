import {
  HTTP_DEFAULT_RETRY_COUNT,
  HTTP_DEFAULT_RETRY_DELAY_MS,
  HTTP_DEFAULT_TIMEOUT_MS,
} from "@/config/constants";
import { ExternalApiError } from "@/shared/errors";
import { sleep } from "@/shared/utils";

/**
 * Provider-agnostic HTTP helper: timeout + retry on top of `fetch`. This is
 * infrastructure only — no provider (Claude, Suno, Resend, Supabase) is
 * wired up here. Provider adapters will build on top of this later.
 */

export interface HttpRequestOptions extends Omit<RequestInit, "signal"> {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

async function requestOnce(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function httpRequest(
  url: string,
  options: HttpRequestOptions = {},
): Promise<Response> {
  const {
    timeoutMs = HTTP_DEFAULT_TIMEOUT_MS,
    retries = HTTP_DEFAULT_RETRY_COUNT,
    retryDelayMs = HTTP_DEFAULT_RETRY_DELAY_MS,
    ...init
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await requestOnce(url, init, timeoutMs);

      if (!response.ok && response.status >= 500 && attempt < retries) {
        lastError = new ExternalApiError(
          `Request to ${url} failed with status ${response.status}`,
          {
            code: "http_server_error",
            context: { url, status: response.status, attempt },
          },
        );
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
    }
  }

  throw new ExternalApiError(`Request to ${url} failed after ${retries + 1} attempt(s)`, {
    code: "http_request_failed",
    cause: lastError,
    context: { url },
  });
}
