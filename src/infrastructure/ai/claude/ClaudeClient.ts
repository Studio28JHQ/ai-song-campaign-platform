import { appConfig } from "@/config/app";
import { ExternalApiError } from "@/shared/errors";
import { httpRequest, type HttpRequestAttemptInfo } from "@/shared/http";
import { logger } from "@/shared/logger/logger";
import type { ClaudeMessageResponse } from "./types";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_API_VERSION = "2023-06-01";
const CLAUDE_MODEL = "claude-sonnet-5";
// Sprint — Claude max_tokens sizing. Live-measured against the current
// production prompt: natural (uncapped) completions ranged 864-3442
// output tokens (thinking-token consumption alone varied 0-2077 on
// identical prompts), so 1024 truncated every single request. 4096
// covered every measured case with margin. Claude-specific only — no
// other provider's request shape is touched.
const CLAUDE_MAX_TOKENS = 4096;

// Claude-specific override of the shared HTTP default (`HTTP_DEFAULT_TIMEOUT_MS`,
// 10s — sized for the platform's other, much faster providers: Turnstile,
// Resend, Mureka's submit call). Live-measured Anthropic latency for this
// prompt is ~12-14s, so 10s aborted every single attempt. 60s applies only
// to this client — every other provider keeps using the shared default,
// unchanged.
const CLAUDE_TIMEOUT_MS = 60_000;

export interface ClaudeMessageRequest {
  system: string;
  user: string;
}

/**
 * Not `error instanceof Error && error.name === "AbortError"` — whether
 * `DOMException` (what an aborted `fetch` actually rejects with) extends
 * `Error` is environment-dependent (true in Node, false in jsdom), so an
 * `instanceof Error` guard would silently miss real aborts in some
 * runtimes. Checking `.name` directly works regardless.
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
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
    // Mutated (never reassigned) by `onAttempt` below — avoids a `let`
    // narrowed to `null` at every later read, since it's only ever
    // reassigned inside a closure TypeScript can't order against.
    const lastAttempt: { attempt: number | undefined; elapsedMs: number | undefined } = {
      attempt: undefined,
      elapsedMs: undefined,
    };

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
      // Claude-specific timeout override only — `retries`/`retryDelayMs`
      // are deliberately left unset so both keep using the shared
      // defaults (`HTTP_DEFAULT_RETRY_COUNT`/`HTTP_DEFAULT_RETRY_DELAY_MS`),
      // unchanged. See `CLAUDE_TIMEOUT_MS`.
      timeoutMs: CLAUDE_TIMEOUT_MS,
      onAttempt: (info: HttpRequestAttemptInfo) => {
        lastAttempt.attempt = info.attempt + 1;
        lastAttempt.elapsedMs = info.elapsedMs;

        if (isAbortError(info.error)) {
          logger.error("Claude request aborted (timeout exceeded)", {
            timeoutMs: CLAUDE_TIMEOUT_MS,
            elapsedMs: info.elapsedMs,
            attempt: info.attempt + 1,
            abortErrorConfirmed: true,
          });
        }
      },
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

    let body: ClaudeMessageResponse;

    try {
      body = (await response.json()) as ClaudeMessageResponse;
    } catch (cause) {
      throw new ExternalApiError("Claude API response body was not valid JSON.", {
        code: "claude.invalid_response_body",
        cause,
      });
    }

    // A `stop_reason` of "max_tokens" means Anthropic cut generation off
    // mid-response — `body.content` can still look like a well-formed
    // array here (it's the JSON *string inside* one of its text blocks
    // that's cut off), so this must be checked independently of, and
    // before, the content-array check below. Never attempt to parse or
    // use this text — reject it outright, through the same
    // `ExternalApiError` → 503 "claude_unavailable" flow as every other
    // failure here, so `ResponseParser` never sees a partial JSON string.
    if (body.stop_reason === "max_tokens") {
      logger.error("Claude response truncated (max_tokens reached)", {
        stopReason: body.stop_reason,
        inputTokens: body.usage?.input_tokens,
        outputTokens: body.usage?.output_tokens,
        thinkingTokens: body.usage?.output_tokens_details?.thinking_tokens,
        durationMs: lastAttempt.elapsedMs,
        attempt: lastAttempt.attempt,
      });

      throw new ExternalApiError("Claude response was truncated at the max_tokens limit.", {
        code: "claude.response_truncated",
        context: { stopReason: body.stop_reason },
      });
    }

    // Response-integrity check: a 2xx status and parseable JSON aren't
    // proof the body is actually usable — verify the one structural
    // expectation this class's own contract documents (a `content` array)
    // before accepting it. Anything about the *content* of that array
    // (the moderation/lyrics JSON inside its text block) is
    // `ResponseParser`'s job, not this one's — this only guards against an
    // incomplete/malformed envelope, and routes through the exact same
    // `ExternalApiError` → 503 "claude_unavailable" flow as every other
    // failure here.
    if (!Array.isArray(body.content)) {
      throw new ExternalApiError("Claude API response was missing the expected content array.", {
        code: "claude.incomplete_response",
        context: { stopReason: body.stop_reason },
      });
    }

    logger.info("Claude request completed", {
      durationMs: lastAttempt.elapsedMs,
      attempt: lastAttempt.attempt,
      model: CLAUDE_MODEL,
      stopReason: body.stop_reason,
      inputTokens: body.usage?.input_tokens,
      outputTokens: body.usage?.output_tokens,
      thinkingTokens: body.usage?.output_tokens_details?.thinking_tokens,
      totalTokens:
        body.usage?.input_tokens !== undefined && body.usage?.output_tokens !== undefined
          ? body.usage.input_tokens + body.usage.output_tokens
          : undefined,
    });

    return body;
  }
}
