export interface GenerateSongInput {
  leadId: string;
}

export interface GenerateSongResult {
  songId: string;
  status: string;
  estimatedNextAction: string;
}

export type GenerateSongErrorCode =
  | "invalid_request"
  | "lead_not_found"
  | "song_already_exists"
  | "lyrics_not_approved"
  | "campaign_disabled"
  | "business_rule_violation"
  | "internal_error";

const KNOWN_ERROR_CODES: readonly GenerateSongErrorCode[] = [
  "invalid_request",
  "lead_not_found",
  "song_already_exists",
  "lyrics_not_approved",
  "campaign_disabled",
  "business_rule_violation",
  "internal_error",
];

const DEFAULT_MESSAGES: Record<GenerateSongErrorCode, string> = {
  invalid_request: "Please try again.",
  lead_not_found: "We couldn't find your registration. Please register again.",
  song_already_exists: "You have already generated your song.",
  lyrics_not_approved: "Please approve your lyrics before generating a song.",
  campaign_disabled: "Song generation is not currently available.",
  business_rule_violation: "This request could not be completed.",
  internal_error: "Something went wrong. Please try again.",
};

export class GenerateSongError extends Error {
  constructor(
    message: string,
    public readonly code: GenerateSongErrorCode,
  ) {
    super(message);
    this.name = "GenerateSongError";
  }
}

function toErrorCode(value: unknown): GenerateSongErrorCode {
  return typeof value === "string" && (KNOWN_ERROR_CODES as string[]).includes(value)
    ? (value as GenerateSongErrorCode)
    : "internal_error";
}

/**
 * Thin HTTP client for `POST /api/song/generate`. No business rule is
 * evaluated here; the endpoint returns immediately (`202 Accepted`)
 * without waiting for the song to finish generating — see
 * docs/Architecture/System_Architecture.md.
 */
export async function generateSong(input: GenerateSongInput): Promise<GenerateSongResult> {
  let response: Response;

  try {
    response = await fetch("/api/song/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new GenerateSongError(
      "We couldn't reach the server. Please check your connection and try again.",
      "internal_error",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown; message?: unknown };
    const code = toErrorCode(record.error);
    const message = typeof record.message === "string" ? record.message : DEFAULT_MESSAGES[code];
    throw new GenerateSongError(message, code);
  }

  return body as GenerateSongResult;
}
