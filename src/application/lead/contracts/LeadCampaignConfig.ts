/**
 * What `CreateLeadUseCase` needs from campaign configuration — nothing
 * more. Keeps the use case decoupled from `@/config` (a concrete,
 * server-only module) so it can be constructed with a fake in tests and
 * wired to the real configuration later without changing this file.
 */
export interface LeadCampaignConfig {
  getMaxLyricAttempts(): number;
}
