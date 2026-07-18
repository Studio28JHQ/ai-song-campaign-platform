export type RecentActivityEventType =
  | "lead_registered"
  | "lyrics_generated"
  | "lyrics_approved"
  | "song_completed"
  | "email_sent"
  | "email_resent";

export interface RecentActivityRow {
  type: RecentActivityEventType;
  timestamp: string;
  leadId: string;
  parentName: string;
  babyName: string;
}

export interface ListRecentActivityResult {
  items: RecentActivityRow[];
}

export class ListRecentActivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListRecentActivityError";
  }
}

/** Thin HTTP client for `GET /api/admin/activity`. No business rule is evaluated here. */
export async function listRecentActivity(): Promise<ListRecentActivityResult> {
  let response: Response;

  try {
    response = await fetch("/api/admin/activity");
  } catch {
    throw new ListRecentActivityError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Algo salió mal.";
    throw new ListRecentActivityError(message);
  }

  return body as ListRecentActivityResult;
}
