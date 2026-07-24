export interface CampaignSettingsResponse {
  gtmContainerId: string | null;
}

export interface UpdateGtmSettingsRequest {
  gtmContainerId: string | null;
  actingAdminId: string;
}
