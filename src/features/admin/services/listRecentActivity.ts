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
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Something went wrong.";
    throw new ListRecentActivityError(message);
  }

  return body as ListRecentActivityResult;
}
