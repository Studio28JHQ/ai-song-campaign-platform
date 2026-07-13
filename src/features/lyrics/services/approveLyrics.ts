export interface ApproveLyricsInput {
  lyricsId: string;
}

export interface ApproveLyricsResult {
  lyrics: {
    id: string;
    content: string;
    version: number;
    approved: boolean;
  };
}

export type ApproveLyricsErrorCode =
  "invalid_request" | "lyrics_not_found" | "business_rule_violation" | "internal_error";

const KNOWN_ERROR_CODES: readonly ApproveLyricsErrorCode[] = [
  "invalid_request",
  "lyrics_not_found",
  "business_rule_violation",
  "internal_error",
];

const DEFAULT_MESSAGES: Record<ApproveLyricsErrorCode, string> = {
  invalid_request: "Please try again.",
  lyrics_not_found: "We couldn't find these lyrics. Please generate them again.",
  business_rule_violation: "This request could not be completed.",
  internal_error: "Something went wrong. Please try again.",
};

export class ApproveLyricsError extends Error {
  constructor(
    message: string,
    public readonly code: ApproveLyricsErrorCode,
  ) {
    super(message);
    this.name = "ApproveLyricsError";
  }
}

function toErrorCode(value: unknown): ApproveLyricsErrorCode {
  return typeof value === "string" && (KNOWN_ERROR_CODES as string[]).includes(value)
    ? (value as ApproveLyricsErrorCode)
    : "internal_error";
}

/** Thin HTTP client for `POST /api/lyrics/approve`. No business rule is evaluated here. */
export async function approveLyrics(input: ApproveLyricsInput): Promise<ApproveLyricsResult> {
  let response: Response;

  try {
    response = await fetch("/api/lyrics/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApproveLyricsError(
      "We couldn't reach the server. Please check your connection and try again.",
      "internal_error",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown; message?: unknown };
    const code = toErrorCode(record.error);
    const message = typeof record.message === "string" ? record.message : DEFAULT_MESSAGES[code];
    throw new ApproveLyricsError(message, code);
  }

  return body as ApproveLyricsResult;
}
