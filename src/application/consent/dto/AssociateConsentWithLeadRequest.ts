export interface AssociateConsentWithLeadRequest {
  /** The visitor's first-party consent session id — `null` when no consent cookie was ever set (best-effort association only). */
  sessionId: string | null;
  leadId: string;
}
