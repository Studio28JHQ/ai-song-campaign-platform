export interface CampaignSettings {
  gtmContainerId: string | null;
  /** The provider tried first for every new song. */
  primaryProvider: string;
  /** The provider tried only on a whitelisted pre-generation failure; `null` disables fallback. */
  fallbackProvider: string | null;
}

export interface GenerationRoutingInput {
  primaryProvider: string;
  fallbackProvider: string | null;
}

export class CampaignSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignSettingsError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Algo salió mal.";
    throw new CampaignSettingsError(message);
  }

  return body as T;
}

async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new CampaignSettingsError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }
}

/** Thin HTTP client for the Configuración screen's editable settings (Feature 1 — GTM Configuration). */
export async function getCampaignSettings(): Promise<CampaignSettings> {
  const response = await safeFetch("/api/admin/settings");
  return parseResponse<CampaignSettings>(response);
}

export async function updateGtmContainerId(
  gtmContainerId: string | null,
): Promise<CampaignSettings> {
  const response = await safeFetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gtmContainerId }),
  });
  return parseResponse<CampaignSettings>(response);
}

/**
 * Persists the generation routing. Its own endpoint, so the GTM setting's
 * payload and validation are untouched; the server re-validates everything
 * (known providers, primary !== fallback) regardless of what the form sends.
 */
export async function updateGenerationRouting(
  routing: GenerationRoutingInput,
): Promise<CampaignSettings> {
  const response = await safeFetch("/api/admin/settings/generation", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(routing),
  });
  return parseResponse<CampaignSettings>(response);
}
