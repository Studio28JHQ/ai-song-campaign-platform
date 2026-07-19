export interface GenerateLyricsInput {
  moodId: string;
  moodName: string;
  moodDescription?: string;
  parentMessage: string;
  turnstileToken: string;
  /** Sprint v1.1 — AI Musical Direction. */
  voice: "FEMALE" | "MALE";
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
  | "too_many_requests"
  | "human_verification_failed"
  | "turnstile_expired_or_reused"
  | "verification_unavailable"
  | "internal_error";

const KNOWN_ERROR_CODES: readonly GenerateLyricsErrorCode[] = [
  "invalid_request",
  "no_session",
  "lead_not_found",
  "no_remaining_attempts",
  "lyrics_already_approved",
  "business_rule_violation",
  "claude_unavailable",
  "too_many_requests",
  "human_verification_failed",
  "turnstile_expired_or_reused",
  "verification_unavailable",
  "internal_error",
];

// Sprint UI-1 — Spanish Localization. Keyed by the server's stable error
// `code` (never its raw `message`) — see `generateLyrics` below, which
// prefers this Spanish text unconditionally, without needing any change
// to the API itself.
const DEFAULT_MESSAGES: Record<GenerateLyricsErrorCode, string> = {
  invalid_request: "Revisa tu mensaje e inténtalo de nuevo.",
  no_session: "No encontramos tu registro. Por favor regístrate de nuevo.",
  lead_not_found: "No encontramos tu registro. Por favor regístrate de nuevo.",
  no_remaining_attempts: "Ya no tienes intentos disponibles para crear la letra.",
  lyrics_already_approved: "Ya aprobaste una versión de la letra.",
  business_rule_violation: "No pudimos completar esta solicitud.",
  claude_unavailable:
    "El servicio de creación de letras no está disponible en este momento. Inténtalo en unos minutos.",
  too_many_requests: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
  human_verification_failed: "No pudimos verificar que no eres un robot. Inténtalo de nuevo.",
  turnstile_expired_or_reused: "Tu verificación expiró. Vuelve a verificar e inténtalo nuevamente.",
  verification_unavailable:
    "La verificación no está disponible en este momento. Inténtalo en unos minutos.",
  internal_error: "Algo salió mal. Inténtalo de nuevo.",
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
    throw new GenerateLyricsError(DEFAULT_MESSAGES[code], code);
  }

  return body as GenerateLyricsResult;
}
