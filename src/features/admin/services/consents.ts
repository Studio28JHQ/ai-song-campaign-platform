export interface AdminConsentRow {
  id: string;
  sessionId: string;
  leadId: string | null;
  ipAddress: string;
  userAgent: string;
  policyVersion: string;
  acceptedAt: string;
  createdAt: string;
  updatedAt: string;
  lead: {
    parentName: string;
    babyName: string;
    email: string;
  } | null;
}

export interface ListConsentsResult {
  items: AdminConsentRow[];
}

export class ConsentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsentsError";
  }
}

/** Thin HTTP client for the "Consentimientos" screen (Feature 1 — Consent Management Screen). No business rule is evaluated here. */
export async function listConsents(): Promise<ListConsentsResult> {
  let response: Response;

  try {
    response = await fetch("/api/admin/consents");
  } catch {
    throw new ConsentsError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Algo salió mal.";
    throw new ConsentsError(message);
  }

  return body as ListConsentsResult;
}

/** Builds the CSV export URL — the browser downloads it natively via the response's `Content-Disposition` header (same pattern as `buildLeadsExportUrl`), no client-side blob handling needed. */
export function buildConsentsExportUrl(): string {
  return "/api/admin/consents/export";
}
