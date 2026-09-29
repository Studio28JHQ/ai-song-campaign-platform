import { GoogleGenAI } from "@google/genai";
import { appConfig } from "@/config/app";
import { ExternalApiError } from "@/shared/errors";
import { LYRIA_MODEL } from "./types";

/**
 * Minimal client for Google's Lyria music generation, over the official
 * `@google/genai` SDK's Interactions API — the one surface Google documents
 * for Lyria 3.5. Talks to Lyria and nothing else.
 *
 * Why the official SDK here, when every other integration in this codebase
 * is a hand-rolled `httpRequest` call: authentication. The SDK owns the
 * `x-goog-api-key` header, so the key never touches a URL, a query string,
 * or this module's own error objects. There is deliberately no `?key=`
 * fallback — a request that fails authentication must fail loudly as a
 * configuration problem, not silently reroute the credential into a place
 * that gets logged.
 *
 * Three rules this class exists to enforce:
 *
 * 1. **The key is validated lazily.** `GEMINI_API_KEY` is optional in the
 *    environment schema, so the application boots — and Mureka keeps
 *    working — with no Google credential configured at all. Only an actual
 *    attempt to generate with Lyria fails, and it fails as
 *    `lyria.missing_api_key` on that one song.
 * 2. **One attempt, never a retry.** `maxRetries: 0` on the call. Lyria
 *    charges per generation and returns the finished audio inline, so a
 *    retried request is a second song paid for and thrown away. The SDK
 *    retries by default; this turns that off, matching the same decision
 *    made for Mureka's submission POST.
 * 3. **The key never leaves this file.** Errors are re-thrown as
 *    `ExternalApiError` carrying only a status and a short message —
 *    never the SDK error object, never request options, never a URL.
 */
export class LyriaClient {
  private client: GoogleGenAI | null = null;

  /**
   * Generates a song from `prompt`. Returns the raw SDK response for
   * `ResponseParser` to validate — this class never inspects the audio.
   */
  async generate(prompt: string): Promise<unknown> {
    const client = this.resolveClient();

    try {
      return await client.interactions.create(
        { model: LYRIA_MODEL, input: prompt },
        { maxRetries: 0 },
      );
    } catch (error) {
      throw LyriaClient.mapError(error);
    }
  }

  /**
   * Builds the SDK client on first use, not at module load: constructing it
   * requires the API key, and this adapter must be importable (and
   * registrable) in a deployment that has no Google credential configured.
   */
  private resolveClient(): GoogleGenAI {
    if (this.client) {
      return this.client;
    }

    const apiKey = appConfig.lyria.apiKey;

    if (!apiKey) {
      throw new ExternalApiError(
        "Lyria is not configured: GEMINI_API_KEY is missing from the environment.",
        { code: "lyria.missing_api_key" },
      );
    }

    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  /**
   * Maps a Google API failure onto the shared `ExternalApiError` taxonomy,
   * mirroring `MurekaClient.mapErrorResponse` so `providerFallbackPolicy`
   * can reason about both providers with one set of rules.
   *
   * The only code in here that the fallback whitelist accepts is
   * `lyria.quota_exceeded` — an exhausted quota or billing failure, which
   * Google reports as `RESOURCE_EXHAUSTED`/429 and which means no audio was
   * produced. A 429 that is plain rate limiting is classified separately
   * (`lyria.rate_limited`) precisely so it does *not* trigger a paid
   * fallback: the queue simply tries again on a later tick.
   *
   * Nothing from the original error is attached beyond its status and a
   * truncated message: SDK error objects can carry request context, and
   * this taxonomy is what ends up in logs and in `Song.providerError`.
   */
  private static mapError(error: unknown): ExternalApiError {
    const status = LyriaClient.extractStatus(error);
    const message = LyriaClient.extractMessage(error);
    const context = { status };

    if (status === 401) {
      return new ExternalApiError("Lyria rejected the request: invalid authentication.", {
        code: "lyria.invalid_authentication",
        context,
      });
    }

    if (status === 403) {
      return new ExternalApiError("Lyria rejected the request: forbidden.", {
        code: "lyria.forbidden",
        context,
      });
    }

    if (status === 429 || /RESOURCE_EXHAUSTED/i.test(message)) {
      const isQuota = /quota|billing|credit|resource_exhausted/i.test(message);

      return new ExternalApiError(
        isQuota
          ? "Lyria rejected the request: quota or billing exhausted."
          : "Lyria rejected the request: rate limit reached.",
        { code: isQuota ? "lyria.quota_exceeded" : "lyria.rate_limited", context },
      );
    }

    if (status === 400) {
      return new ExternalApiError("Lyria rejected the request: invalid request.", {
        code: "lyria.invalid_request",
        context,
      });
    }

    if (status !== undefined && status >= 500) {
      return new ExternalApiError("Lyria responded with a server error.", {
        code: "lyria.server_error",
        context,
      });
    }

    return new ExternalApiError("Lyria request failed.", {
      code: "lyria.api_error",
      context,
    });
  }

  private static extractStatus(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null) return undefined;

    const record = error as { status?: unknown; code?: unknown };
    if (typeof record.status === "number") return record.status;
    if (typeof record.code === "number") return record.code;

    return undefined;
  }

  /**
   * Only the message text, capped — never the error object, and never its
   * `stack`, `request`, `config` or `headers`, any of which could carry the
   * credential the SDK sends.
   */
  private static extractMessage(error: unknown): string {
    if (typeof error !== "object" || error === null) return "";

    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message.slice(0, 300) : "";
  }
}
