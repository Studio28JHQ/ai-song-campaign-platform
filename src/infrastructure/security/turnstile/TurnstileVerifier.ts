import type { TurnstileClient } from "./TurnstileClient";

export interface TurnstileVerificationResult {
  success: boolean;
  errorCodes: string[];
}

/** Cloudflare's documented code for a token that already expired or was already redeemed. */
const EXPIRED_OR_DUPLICATE_ERROR_CODE = "timeout-or-duplicate";

/**
 * Interprets a Cloudflare Turnstile token against the `siteverify`
 * endpoint (Sprint 8.2 — Abuse Protection). Every public form (lead
 * registration, lyrics generation, lyrics regeneration) must pass a
 * fresh, valid token here before the request reaches application logic
 * — verification always happens server-side; the client-side widget is
 * never trusted on its own.
 */
export class TurnstileVerifier {
  constructor(private readonly client: TurnstileClient) {}

  async verify(
    token: string | undefined | null,
    remoteIp?: string,
  ): Promise<TurnstileVerificationResult> {
    if (!token || token.trim().length === 0) {
      return { success: false, errorCodes: ["missing-input-response"] };
    }

    const response = await this.client.siteverify(token, remoteIp);

    return {
      success: response.success === true,
      errorCodes: response["error-codes"] ?? [],
    };
  }

  /** True when the token was well-formed but expired or already redeemed. */
  isExpiredOrAlreadyUsed(result: TurnstileVerificationResult): boolean {
    return result.errorCodes.includes(EXPIRED_OR_DUPLICATE_ERROR_CODE);
  }
}
