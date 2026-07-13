/**
 * What `GenerateSongUseCase` needs to know about a campaign — nothing
 * more. There is no Campaign domain module yet (out of scope for this
 * task — see PROJECT_MANIFEST.md), so this is a narrow port rather than
 * a full aggregate/repository, satisfied by a thin Prisma-backed adapter
 * in `src/infrastructure/`.
 */
export interface CampaignGate {
  isActiveAndGenerationEnabled(campaignId: string): Promise<boolean>;
}
