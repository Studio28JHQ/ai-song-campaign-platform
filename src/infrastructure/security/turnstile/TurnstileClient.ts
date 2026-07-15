import { appConfig } from "@/config/app";
import { ExternalApiError } from "@/shared/errors";
import { httpRequest } from "@/shared/http";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileSiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Minimal HTTP client for Cloudflare Turnstile's `siteverify` endpoint —
 * talks to Turnstile and nothing else, via the shared `httpRequest`
 * helper (timeout + retry — same pattern as `ClaudeClient`/`SunoClient`).
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

    try {
      return (await response.json()) as TurnstileSiteverifyResponse;
    } catch (cause) {
      throw new ExternalApiError("Turnstile API response body was not valid JSON.", {
        code: "turnstile.invalid_response_body",
        cause,
      });
    }
  }
}
