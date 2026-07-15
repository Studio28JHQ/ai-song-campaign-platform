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
  | "verification_unavailable"
  | "internal_error";

const KNOWN_ERROR_CODES: readonly RegisterLeadErrorCode[] = [
  "invalid_request",
  "email_already_registered",
  "business_rule_violation",
  "too_many_requests",
  "human_verification_failed",
  "verification_unavailable",
  "internal_error",
];

const DEFAULT_MESSAGES: Record<RegisterLeadErrorCode, string> = {
  invalid_request: "Please check the form and try again.",
  email_already_registered: "This email has already been used to register.",
  business_rule_violation: "This request could not be completed.",
  too_many_requests: "Too many requests. Please wait a few minutes before trying again.",
  human_verification_failed: "We couldn't verify you're not a robot. Please try again.",
  verification_unavailable: "Verification is temporarily unavailable. Please try again shortly.",
  internal_error: "Something went wrong. Please try again.",
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
      "We couldn't reach the server. Please check your connection and try again.",
      "internal_error",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown; message?: unknown };
    const code = toErrorCode(record.error);
    const message = typeof record.message === "string" ? record.message : DEFAULT_MESSAGES[code];
    throw new RegisterLeadError(message, code);
  }

  return body as RegisterLeadResult;
}
