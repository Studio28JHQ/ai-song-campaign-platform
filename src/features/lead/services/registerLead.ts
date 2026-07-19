export interface RegisterLeadInput {
  campaignId: string;
  parentName: string;
  babyName: string;
  babyAge?: number;
  city?: string;
  email: string;
  phone?: string;
  turnstileToken: string;
}

export interface RegisterLeadResult {
  remainingAttempts: number;
  status: string;
}

export type RegisterLeadErrorCode =
  | "invalid_request"
  | "email_already_registered"
  | "business_rule_violation"
  | "too_many_requests"
  | "human_verification_failed"
  | "turnstile_expired_or_reused"
  | "verification_unavailable"
  | "internal_error";

const KNOWN_ERROR_CODES: readonly RegisterLeadErrorCode[] = [
  "invalid_request",
  "email_already_registered",
  "business_rule_violation",
  "too_many_requests",
  "human_verification_failed",
  "turnstile_expired_or_reused",
  "verification_unavailable",
  "internal_error",
];

// Sprint UI-1 — Spanish Localization. Keyed by the server's stable error
// `code` (never its raw `message`) — see `registerLead` below, which
// prefers this Spanish text unconditionally, without needing any change
// to the API itself.
const DEFAULT_MESSAGES: Record<RegisterLeadErrorCode, string> = {
  invalid_request: "Revisa el formulario e inténtalo de nuevo.",
  email_already_registered: "Este correo ya fue utilizado para registrarse.",
  business_rule_violation: "No pudimos completar esta solicitud.",
  too_many_requests: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
  human_verification_failed: "No pudimos verificar que no eres un robot. Inténtalo de nuevo.",
  turnstile_expired_or_reused: "Tu verificación expiró. Vuelve a verificar e inténtalo nuevamente.",
  verification_unavailable:
    "La verificación no está disponible en este momento. Inténtalo en unos minutos.",
  internal_error: "Algo salió mal. Inténtalo de nuevo.",
};

export class RegisterLeadError extends Error {
  constructor(
    message: string,
    public readonly code: RegisterLeadErrorCode,
  ) {
    super(message);
    this.name = "RegisterLeadError";
  }
}

function toErrorCode(value: unknown): RegisterLeadErrorCode {
  return typeof value === "string" && (KNOWN_ERROR_CODES as string[]).includes(value)
    ? (value as RegisterLeadErrorCode)
    : "internal_error";
}

/**
 * Thin HTTP client for `POST /api/leads`. No business rule is evaluated
 * here — this only calls the endpoint and translates its response into a
 * typed result or a typed, user-friendly error. Uniqueness, attempt
 * limits, etc. are enforced server-side (see docs/Product/Business_Rules.md).
 */
export async function registerLead(input: RegisterLeadInput): Promise<RegisterLeadResult> {
  let response: Response;

  try {
    response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new RegisterLeadError(
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
    throw new RegisterLeadError(DEFAULT_MESSAGES[code], code);
  }

  return body as RegisterLeadResult;
}
