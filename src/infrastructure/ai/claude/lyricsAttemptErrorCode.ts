import { ExternalApiError, ValidationError } from "@/shared/errors";

/**
 * Sprint FINAL-2 — Lyrics Generation Traceability.
 *
 * Normalises a thrown lyrics-generation failure into one of a small,
 * fixed set of codes, for `GenerationAttempt.errorCode`.
 *
 * Why normalise at all: the provider layer raises eleven different codes
 * (`claude.malformed_response`, `claude.invalid_json`,
 * `claude.empty_response`, …) that all mean the same thing operationally
 * — "Claude answered, but not in a shape we can use". Storing them raw
 * would make the one question this table exists to answer ("what is
 * actually going wrong for families who never got a song?") a matter of
 * grouping by eleven strings whose spelling changes whenever a parser
 * message is reworded.
 *
 * Why not more codes: this maps *only* distinctions the code can already
 * make. No code is invented for a cause the provider cannot currently
 * tell apart — an unrecognised failure stays `INTERNAL_ERROR` rather than
 * being guessed at, which keeps the data honest and keeps
 * `INTERNAL_ERROR` a useful signal that something new is happening.
 */

export const LYRICS_ATTEMPT_ERROR_CODES = {
  /** The lyrics came back over the 360-character hard maximum. Retried internally. */
  outputTooLong: "CLAUDE_OUTPUT_TOO_LONG",
  /** Claude answered, but the answer was truncated, empty or unparseable. */
  invalidResponse: "CLAUDE_INVALID_RESPONSE",
  /** HTTP 429 — Claude throttled us. */
  rateLimit: "CLAUDE_RATE_LIMIT",
  /** Any other non-2xx from Claude (4xx configuration problems, 5xx outages). */
  apiError: "CLAUDE_API_ERROR",
  /** The request never got an answer at all: timeout, DNS, connection reset. */
  unavailable: "CLAUDE_UNAVAILABLE",
  /** Input rejected by our own validation (see the note below). */
  validation: "LYRICS_VALIDATION_ERROR",
  /** A bug, not a provider failure: something we did not anticipate threw. */
  internal: "INTERNAL_ERROR",
} as const;

export type LyricsAttemptErrorCode =
  (typeof LYRICS_ATTEMPT_ERROR_CODES)[keyof typeof LYRICS_ATTEMPT_ERROR_CODES];

/** Every provider code that means "Claude answered, but unusably". */
const INVALID_RESPONSE_CODES: ReadonlySet<string> = new Set([
  "claude.response_truncated",
  "claude.invalid_response_body",
  "claude.empty_response",
  "claude.incomplete_response",
  "claude.malformed_response",
  "claude.invalid_json",
]);

export function toLyricsAttemptErrorCode(error: unknown): LyricsAttemptErrorCode {
  if (error instanceof ExternalApiError) {
    if (error.code === "claude.lyrics_too_long") {
      return LYRICS_ATTEMPT_ERROR_CODES.outputTooLong;
    }

    if (error.code !== undefined && INVALID_RESPONSE_CODES.has(error.code)) {
      return LYRICS_ATTEMPT_ERROR_CODES.invalidResponse;
    }

    if (error.code === "claude.api_error") {
      // `ClaudeClient` folds every non-2xx into one code and keeps the HTTP
      // status in the context. Throttling is the one status worth telling
      // apart: it is transient and self-resolving, while everything else
      // here needs a human.
      return extractStatus(error) === 429
        ? LYRICS_ATTEMPT_ERROR_CODES.rateLimit
        : LYRICS_ATTEMPT_ERROR_CODES.apiError;
    }

    if (error.code === "http_request_failed") {
      // The shared `httpRequest` helper exhausted its retries without a
      // response: timeout, socket error, DNS. Distinct from `apiError`
      // because Claude may never have seen the request.
      return LYRICS_ATTEMPT_ERROR_CODES.unavailable;
    }

    return LYRICS_ATTEMPT_ERROR_CODES.apiError;
  }

  // Not reachable from inside the provider today: the parent's message is
  // validated in `GenerateLyricsForLeadUseCase` *before* any provider call,
  // and that rejection deliberately does not create an attempt row (there
  // was no attempt). Kept so the vocabulary is complete if validation ever
  // moves inside a call's scope.
  if (error instanceof ValidationError) {
    return LYRICS_ATTEMPT_ERROR_CODES.validation;
  }

  return LYRICS_ATTEMPT_ERROR_CODES.internal;
}

/**
 * The short, self-authored description stored next to the code.
 *
 * Deliberately `error.message` and nothing else: an `ExternalApiError`'s
 * `context` can carry the raw Claude response text (`claude.invalid_json`
 * attaches it verbatim), which contains the generated lyrics and can echo
 * the parent's own message. Messages in this codebase are written by us
 * and carry only lengths, statuses and stop reasons.
 */
export function toLyricsAttemptFailureReason(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const message = error.message.trim();
  return message.length > 0 ? message.slice(0, 300) : null;
}

function extractStatus(error: ExternalApiError): number | undefined {
  const status = error.context?.status;
  return typeof status === "number" ? status : undefined;
}
