export interface GtmSettings {
  gtmContainerId: string | null;
}

/** Thin HTTP client for the Landing's GTM script (Feature 1 — GTM Configuration). No business rule is evaluated here. */
export async function getGtmSettings(): Promise<GtmSettings> {
  const response = await fetch("/api/settings/gtm");
  if (!response.ok) {
    return { gtmContainerId: null };
  }
  return (await response.json()) as GtmSettings;
}
