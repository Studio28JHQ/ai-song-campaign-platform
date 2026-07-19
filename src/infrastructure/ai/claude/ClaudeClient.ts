import { appConfig } from "@/config/app";
import { ExternalApiError } from "@/shared/errors";
import { httpRequest } from "@/shared/http";
import { logger } from "@/shared/logger/logger";
import type { ClaudeMessageResponse } from "./types";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_API_VERSION = "2023-06-01";
const CLAUDE_MODEL = "claude-sonnet-5";
const CLAUDE_MAX_TOKENS = 1024;

export interface ClaudeMessageRequest {
  system: string;
  user: string;
}

/**
 * Minimal HTTP client for Anthropic's Messages API — talks to Claude and
 * nothing else. Prompt content and response parsing are `PromptBuilder`'s
 * and `ResponseParser`'s job, not this class's. Network errors and
 * transient failures are retried by the shared `httpRequest` helper; this
 * class only has to handle a non-ok HTTP status and an invalid response
 * body.
 */
export class ClaudeClient {
  async sendMessage(request: ClaudeMessageRequest): Promise<ClaudeMessageResponse> {
    const response = await httpRequest(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": appConfig.claude.apiKey,
        "anthropic-version": CLAUDE_API_VERSION,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
      }),
    });

    if (!response.ok) {
      const details = await response.json().catch(() => null);
      // Anthropic's own request id (header `request-id`), when present —
      // the single most useful thing to hand Anthropic support when
      // escalating a failure. Inspect and log the raw error payload here,
      // before it is wrapped into the generic `ExternalApiError` the rest
      // of the app only ever sees the message/code of.
      const requestId = response.headers.get("request-id") ?? undefined;
      logger.error("Anthropic API returned an error response", {
        status: response.status,
        requestId,
        details,
      });

      throw new ExternalApiError(`Claude API responded with status ${response.status}.`, {
        code: "claude.api_error",
        context: { status: response.status, details, requestId },
      });
    }

    try {
      return (await response.json()) as ClaudeMessageResponse;
    } catch (cause) {
      throw new ExternalApiError("Claude API response body was not valid JSON.", {
        code: "claude.invalid_response_body",
        cause,
      });
    }
  }
}
