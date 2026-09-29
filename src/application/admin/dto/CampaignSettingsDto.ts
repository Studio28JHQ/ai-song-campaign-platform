export interface CampaignSettingsResponse {
  gtmContainerId: string | null;
  /** The provider `GenerationDispatcher` tries first for every new song. */
  primaryProvider: string;
  /** The provider tried only on a whitelisted pre-generation failure; `null` disables fallback. */
  fallbackProvider: string | null;
}

export interface UpdateGtmSettingsRequest {
  gtmContainerId: string | null;
  actingAdminId: string;
}

export interface UpdateGenerationRoutingRequest {
  primaryProvider: string;
  fallbackProvider: string | null;
  actingAdminId: string;
}
