/** Identifies the authenticated admin carried inside a session token. */
export interface AdminSessionPayload {
  adminId: string;
  email: string;
}

export interface IssuedSessionToken {
  token: string;
  expiresAt: Date;
}

/**
 * What `LoginUseCase` (and the session-reading middleware/routes) need to
 * issue and verify a signed session token — nothing more. Keeps the
 * application layer decoupled from the concrete signing mechanism
 * (`@/infrastructure/auth`).
 */
export interface SessionTokenService {
  issue(
    payload: AdminSessionPayload,
    options?: { rememberMe?: boolean },
  ): Promise<IssuedSessionToken>;
  verify(token: string): Promise<AdminSessionPayload | null>;
}
