/**
 * What the parent-facing routes need to issue and resolve a session for a
 * Lead — nothing more. Keeps route handlers decoupled from the concrete
 * token/storage mechanism (a dedicated `LeadSession` DB record, see
 * `docs/Architecture/System_Architecture.md` — Parent Session), so it can
 * be constructed with a fake in tests and swapped later without changing
 * this file.
 */
export interface IssuedLeadSession {
  token: string;
  expiresAt: Date;
}

export interface LeadSessionService {
  /** Issues and persists a new session token for the given Lead. */
  create(leadId: string): Promise<IssuedLeadSession>;

  /** Resolves a token into the Lead id it belongs to, or `null` if the token is missing, unknown, or expired. */
  resolve(token: string): Promise<string | null>;
}
