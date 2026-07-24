/** Input to `Consent.create` — captured at the moment a visitor accepts the privacy banner. */
export interface CreateConsentInput {
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  policyVersion: string;
}

/** Internal entity state. Not exported for external mutation — see `Consent`. */
export interface ConsentProps {
  id: string;
  sessionId: string;
  leadId: string | null;
  ipAddress: string;
  userAgent: string;
  policyVersion: string;
  acceptedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Plain, read-only view of a Consent for callers that need primitives. */
export interface ConsentSnapshot {
  id: string;
  sessionId: string;
  leadId: string | null;
  ipAddress: string;
  userAgent: string;
  policyVersion: string;
  acceptedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
