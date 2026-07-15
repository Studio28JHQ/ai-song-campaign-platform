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

// Sprint UI-1 — Spanish Localization. Keyed by the server's stable error
// `code` (never its raw `message`) — see `approveLyrics` below, which
// prefers this Spanish text unconditionally, without needing any change
// to the API itself.
const DEFAULT_MESSAGES: Record<ApproveLyricsErrorCode, string> = {
  invalid_request: "Inténtalo de nuevo.",
  lyrics_not_found: "No encontramos esta letra. Por favor créala de nuevo.",
  business_rule_violation: "No pudimos completar esta solicitud.",
  internal_error: "Algo salió mal. Inténtalo de nuevo.",
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
      "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
      "internal_error",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown };
    const code = toErrorCode(record.error);
    // Always the local, Spanish, code-keyed message — never the server's
    // own (English) `message` field. See `DEFAULT_MESSAGES` above.
    throw new ApproveLyricsError(DEFAULT_MESSAGES[code], code);
  }

  return body as ApproveLyricsResult;
}
