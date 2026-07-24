/**
 * What the Admin Settings screen and the Landing Page need to know about
 * the campaign's global configuration — currently just the Google Tag
 * Manager container id (Feature 1 — GTM Configuration). There is no
 * Campaign domain module (see `docs/Architecture/Domain_Model.md`), so
 * this is a narrow port rather than a full aggregate/repository,
 * satisfied by a thin Prisma-backed adapter in `src/infrastructure/` —
 * the same pattern as `CampaignGate` (`src/application/song/contracts/`).
 */
export interface CampaignSettingsGate {
  getGtmContainerId(campaignId: string): Promise<string | null>;
  updateGtmContainerId(campaignId: string, gtmContainerId: string | null): Promise<string | null>;
}
