import { appConfig } from "@/config/app";
import { ExternalApiError } from "@/shared/errors";
import { httpRequest } from "@/shared/http";
import { logger } from "@/shared/logger/logger";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileSiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
  metadata?: Record<string, unknown>;
  messages?: string[];
}

/**
 * Minimal HTTP client for Cloudflare Turnstile's `siteverify` endpoint —
 * talks to Turnstile and nothing else, via the shared `httpRequest`
 * helper (timeout + retry — same pattern as `ClaudeClient`/`MurekaClient`).
 * Response interpretation (valid / invalid / expired) is
 * `TurnstileVerifier`'s job, not this class's.
 */
export class TurnstileClient {
  async siteverify(token: string, remoteIp?: string): Promise<TurnstileSiteverifyResponse> {
    const body = new URLSearchParams({
      secret: appConfig.security.turnstile.secretKey,
      response: token,
    });

    if (remoteIp) {
      body.set("remoteip", remoteIp);
    }

    const response = await httpRequest(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw new ExternalApiError(`Turnstile API responded with status ${response.status}.`, {
        code: "turnstile.api_error",
        context: { status: response.status, details },
      });
    }

    let result: TurnstileSiteverifyResponse;

    try {
      result = (await response.json()) as TurnstileSiteverifyResponse;
    } catch (cause) {
      throw new ExternalApiError("Turnstile API response body was not valid JSON.", {
        code: "turnstile.invalid_response_body",
        cause,
      });
    }

    // Cloudflare signals a rejected/expired/reused token with HTTP 200 and
    // `success: false` in the body — not a non-2xx status — so this is the
    // only place that failure is ever visible. Log the complete response
    // (every field Cloudflare's `siteverify` can return, not just
    // `error-codes`) so the real cause is diagnosable server-side, the same
    // as `ClaudeClient` already does for Anthropic.
    if (result.success !== true) {
      logger.error("Turnstile siteverify returned an unsuccessful response", {
        success: result.success,
        errorCodes: result["error-codes"],
        hostname: result.hostname,
        challengeTs: result.challenge_ts,
        metadata: result.metadata,
        action: result.action,
        cdata: result.cdata,
        messages: result.messages,
      });
    }

    return result;
  }
}
