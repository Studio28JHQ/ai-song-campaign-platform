import type { CampaignSettingsGate } from "@/application/campaign/contracts/CampaignSettingsGate";
import type { CampaignSettingsResponse } from "../dto/CampaignSettingsDto";

/**
 * Reads the campaign's global configuration for the Admin Settings screen:
 * the GTM container id (Feature 1) and the generation provider routing.
 */
export class GetCampaignSettingsUseCase {
  constructor(
    private readonly campaignSettingsGate: CampaignSettingsGate,
    private readonly campaignId: string,
  ) {}

  async execute(): Promise<CampaignSettingsResponse> {
    const [gtmContainerId, routing] = await Promise.all([
      this.campaignSettingsGate.getGtmContainerId(this.campaignId),
      this.campaignSettingsGate.getGenerationRouting(this.campaignId),
    ]);

    return {
      gtmContainerId,
      primaryProvider: routing.primaryProvider,
      fallbackProvider: routing.fallbackProvider,
    };
  }
}
