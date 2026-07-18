export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AdminSnapshot {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResult {
  admin: AdminSnapshot;
}

export type LoginErrorCode =
  | "invalid_request"
  | "invalid_credentials"
  | "account_inactive"
  | "business_rule_violation"
  | "internal_error";

const KNOWN_ERROR_CODES: readonly LoginErrorCode[] = [
  "invalid_request",
  "invalid_credentials",
  "account_inactive",
  "business_rule_violation",
  "internal_error",
];

const DEFAULT_MESSAGES: Record<LoginErrorCode, string> = {
  invalid_request: "Revisa tu correo y contraseña e inténtalo de nuevo.",
  invalid_credentials: "Correo o contraseña incorrectos.",
  account_inactive: "Esta cuenta de administrador está inactiva.",
  business_rule_violation: "No pudimos completar esta solicitud.",
  internal_error: "Algo salió mal. Inténtalo de nuevo.",
};

export class LoginError extends Error {
  constructor(
    message: string,
    public readonly code: LoginErrorCode,
  ) {
    super(message);
    this.name = "LoginError";
  }
}

function toErrorCode(value: unknown): LoginErrorCode {
  return typeof value === "string" && (KNOWN_ERROR_CODES as string[]).includes(value)
    ? (value as LoginErrorCode)
    : "internal_error";
}

/**
 * Thin HTTP client for `POST /api/admin/login`. The session is set as an
 * HTTP-only cookie by the server — this function never sees or stores a
 * token itself.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  let response: Response;

  try {
    response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new LoginError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
      "internal_error",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown; message?: unknown };
    const code = toErrorCode(record.error);
    const message = typeof record.message === "string" ? record.message : DEFAULT_MESSAGES[code];
    throw new LoginError(message, code);
  }

  return body as LoginResult;
}
