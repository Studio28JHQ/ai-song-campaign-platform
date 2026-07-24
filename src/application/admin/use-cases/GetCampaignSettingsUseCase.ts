import type { CampaignSettingsGate } from "@/application/campaign/contracts/CampaignSettingsGate";
import type { CampaignSettingsResponse } from "../dto/CampaignSettingsDto";

/** Reads the campaign's global configuration for the Admin Settings screen (Feature 1 — GTM Configuration). */
export class GetCampaignSettingsUseCase {
  constructor(
    private readonly campaignSettingsGate: CampaignSettingsGate,
    private readonly campaignId: string,
  ) {}

  async execute(): Promise<CampaignSettingsResponse> {
    const gtmContainerId = await this.campaignSettingsGate.getGtmContainerId(this.campaignId);
    return { gtmContainerId };
  }
}
