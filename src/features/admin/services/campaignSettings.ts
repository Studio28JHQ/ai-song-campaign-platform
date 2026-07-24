export interface CampaignSettings {
  gtmContainerId: string | null;
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
