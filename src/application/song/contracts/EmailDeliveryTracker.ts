/**
 * Guarantees the "song ready" email is sent at most once per Song, backed
 * by the already-persisted `emailedAt` column on the Song record (see
 * `docs/Architecture/Database_Model.md`) — there is no dedicated
 * EmailDelivery domain module, so this is a narrow port rather than a
 * full aggregate/repository, satisfied by a thin Prisma-backed adapter in
 * `src/infrastructure/`, the same pattern as `CampaignGate`.
 */
export interface EmailDeliveryTracker {
  /**
   * Atomically claims the right to send the email for this song. Returns
   * `true` exactly once per song — the caller must send the email if (and
   * only if) this returns `true` — and `false` on every subsequent call,
   * so a duplicate/retried background job can never send twice.
   */
  claimDelivery(songId: string): Promise<boolean>;
}
