/**
 * One row of the admin Consent screen/export — a read model, not a
 * domain entity. `lead` is populated through the existing `Consent →
 * Lead` relationship (no additional persistence — see
 * `docs/Architecture/Database_Model.md`), `null` when this Consent has
 * never been associated with a Lead.
 */
export interface AdminConsentRow {
  id: string;
  sessionId: string;
  leadId: string | null;
  ipAddress: string;
  userAgent: string;
  policyVersion: string;
  acceptedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lead: {
    parentName: string;
    babyName: string;
    email: string;
  } | null;
}

/**
 * What the admin "Consentimientos" screen needs — the domain
 * `ConsentRepository` (`src/domain/consent/repositories/`) is scoped to
 * the Consent aggregate's own use cases (lookup by session, create,
 * update) and has no "list"/"export" concept, so this is a narrow,
 * admin-specific read-model port, the same pattern as
 * `AdminLyricsListGate`/`AdminLeadExportGate`.
 */
export interface AdminConsentGate {
  /** The most recently created Consent records, newest first. */
  listLatest(limit: number): Promise<AdminConsentRow[]>;
  /** Every Consent record, streamed in bounded batches — never the full result set in memory at once (see docs/Product/User_Flow.md — Performance). */
  streamAll(batchSize: number): AsyncIterable<AdminConsentRow[]>;
}
