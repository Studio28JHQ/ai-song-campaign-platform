import { appConfig } from "@/config/app";
import { ExternalApiError } from "@/shared/errors";
import { httpRequest } from "@/shared/http";
import type { SunoRequestPayload } from "./types";

const SUNO_API_URL = "https://api.suno.ai/v1/generate";

/**
 * Minimal HTTP client for the Suno song generation API — talks to Suno
 * and nothing else. Payload construction and response parsing are
 * `PromptBuilder`'s and `ResponseParser`'s job, not this class's. Network
 * errors and transient failures are retried by the shared `httpRequest`
 * helper; this class only has to handle a non-ok HTTP status and an
 * invalid response body.
 *
 * Suno does not publish a single canonical, versioned public API the way
 * Anthropic does; the endpoint and payload shape here follow the
 * commonly documented "custom mode" generation contract and should be
 * verified against Suno's own API documentation before this integration
 * is pointed at production traffic.
 */
export class SunoClient {
  async generate(payload: SunoRequestPayload): Promise<unknown> {
    const response = await httpRequest(SUNO_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${appConfig.suno.apiKey}`,
      },
      body: JSON.stringify({
        prompt: payload.prompt,
        lyrics: payload.lyrics,
        tags: payload.tags,
        title: payload.title,
        custom_mode: true,
        instrumental: false,
      }),
    });

    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw new ExternalApiError(`Suno API responded with status ${response.status}.`, {
        code: "suno.api_error",
        context: { status: response.status, details },
      });
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new ExternalApiError("Suno API response body was not valid JSON.", {
        code: "suno.invalid_response_body",
        cause,
      });
    }
  }
}
