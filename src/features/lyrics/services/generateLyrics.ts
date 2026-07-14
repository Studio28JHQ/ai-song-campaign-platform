export interface GenerateLyricsInput {
  moodId: string;
  moodName: string;
  moodDescription?: string;
  parentMessage: string;
}

export interface GeneratedLyricsSnapshot {
  id: string;
  content: string;
  version: number;
  approved: boolean;
}

export interface GenerateLyricsResult {
  lyrics: GeneratedLyricsSnapshot | null;
  approved: boolean;
  reason: string | null;
  remainingAttempts: number;
  leadStatus: string;
}

export type GenerateLyricsErrorCode =
  | "invalid_request"
  | "no_session"
  | "lead_not_found"
  | "no_remaining_attempts"
  | "lyrics_already_approved"
  | "business_rule_violation"
  | "claude_unavailable"
  | "internal_error";

const KNOWN_ERROR_CODES: readonly GenerateLyricsErrorCode[] = [
  "invalid_request",
  "no_session",
  "lead_not_found",
  "no_remaining_attempts",
  "lyrics_already_approved",
  "business_rule_violation",
  "claude_unavailable",
  "internal_error",
];

const DEFAULT_MESSAGES: Record<GenerateLyricsErrorCode, string> = {
  invalid_request: "Please check your message and try again.",
  no_session: "We couldn't find your registration. Please register again.",
  lead_not_found: "We couldn't find your registration. Please register again.",
  no_remaining_attempts: "You have no attempts left to generate lyrics.",
  lyrics_already_approved: "You have already approved a lyrics version.",
  business_rule_violation: "This request could not be completed.",
  claude_unavailable:
    "The lyrics generation service is temporarily unavailable. Please try again shortly.",
  internal_error: "Something went wrong. Please try again.",
};

export class GenerateLyricsError extends Error {
  constructor(
    message: string,
    public readonly code: GenerateLyricsErrorCode,
  ) {
    super(message);
    this.name = "GenerateLyricsError";
  }
}

function toErrorCode(value: unknown): GenerateLyricsErrorCode {
  return typeof value === "string" && (KNOWN_ERROR_CODES as string[]).includes(value)
    ? (value as GenerateLyricsErrorCode)
    : "internal_error";
}

/**
 * Thin HTTP client for `POST /api/lyrics/generate`. No business rule is
 * evaluated here — moderation, attempt consumption, and lead validation
 * are enforced server-side.
 */
export async function generateLyrics(input: GenerateLyricsInput): Promise<GenerateLyricsResult> {
  let response: Response;

  try {
    response = await fetch("/api/lyrics/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new GenerateLyricsError(
      "We couldn't reach the server. Please check your connection and try again.",
      "internal_error",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown; message?: unknown };
    const code = toErrorCode(record.error);
    const message = typeof record.message === "string" ? record.message : DEFAULT_MESSAGES[code];
    throw new GenerateLyricsError(message, code);
  }

  return body as GenerateLyricsResult;
}
