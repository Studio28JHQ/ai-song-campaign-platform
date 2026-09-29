/**
 * How the campaign's generation routing is stored and read. Deliberately
 * permissive on the read side: `primaryProvider`/`fallbackProvider` come
 * back as plain strings, not a narrowed union, so a value written before
 * the current provider set existed (the legacy `"suno"`) or by hand in the
 * database surfaces as a controlled `song.unknown_provider` from
 * `SongGenerationProviderRegistry` instead of being asserted into a type it
 * does not satisfy. The write side is strict — see
 * `UpdateGenerationRoutingUseCase`.
 *
 * `fallbackProvider: null` means fallback is disabled: a primary failure
 * ends the song `FAILED`, with no second provider attempted.
 */
export interface GenerationRouting {
  primaryProvider: string;
  fallbackProvider: string | null;
}

export interface CampaignSettingsGate {
  getGtmContainerId(campaignId: string): Promise<string | null>;
  updateGtmContainerId(campaignId: string, gtmContainerId: string | null): Promise<string | null>;
  /**
   * Read fresh by `GenerationDispatcher` on every tick — never cached — so
   * a routing change made in the Admin panel applies to the next song
   * without a redeploy or a server restart.
   */
  getGenerationRouting(campaignId: string): Promise<GenerationRouting>;
  updateGenerationRouting(
    campaignId: string,
    routing: GenerationRouting,
  ): Promise<GenerationRouting>;
}
