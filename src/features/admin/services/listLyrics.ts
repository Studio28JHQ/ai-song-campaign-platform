export interface AdminLyricsRow {
  id: string;
  leadId: string;
  createdAt: string;
  parentName: string;
  babyName: string;
  moodName: string;
  version: number;
  approved: boolean;
  rejectionReason: string | null;
}

export interface ListLyricsResult {
  items: AdminLyricsRow[];
}

export class ListLyricsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListLyricsError";
  }
}

/** Thin HTTP client for `GET /api/admin/lyrics`. No business rule is evaluated here. */
export async function listLyrics(): Promise<ListLyricsResult> {
  let response: Response;

  try {
    response = await fetch("/api/admin/lyrics");
  } catch {
    throw new ListLyricsError(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Something went wrong.";
    throw new ListLyricsError(message);
  }

  return body as ListLyricsResult;
}
