/**
 * What `GenerateSongUseCase` needs to know about a campaign — nothing
 * more. There is no Campaign domain module yet (out of scope for this
 * task — see PROJECT_MANIFEST.md), so this is a narrow port rather than
 * a full aggregate/repository, satisfied by a thin Prisma-backed adapter
 * in `src/infrastructure/`.
 */
export interface CampaignGate {
  /** `false` also when the campaign has already reached its `maximumSongs` budget. */
  isActiveAndGenerationEnabled(campaignId: string): Promise<boolean>;
  /** Atomically increments the campaign's `songsGenerated` counter — called only after a Song completes successfully. */
  incrementSongsGenerated(campaignId: string): Promise<void>;
}
