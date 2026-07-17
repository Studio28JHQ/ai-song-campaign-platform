export type SongStatusFilter = "QUEUED" | "GENERATING" | "COMPLETED" | "FAILED";

export interface AdminSongRow {
  id: string;
  leadId: string;
  createdAt: string;
  parentName: string;
  babyName: string;
  status: string;
  provider: string;
  audioUrl: string | null;
  providerError: string | null;
  emailedAt: string | null;
}

export interface ListSongsInput {
  query?: string;
  status?: SongStatusFilter;
  page: number;
  pageSize: number;
}

export interface ListSongsResult {
  items: AdminSongRow[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListSongsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListSongsError";
  }
}

/** Thin HTTP client for `GET /api/admin/songs`. No business rule is evaluated here. */
export async function listSongs(input: ListSongsInput): Promise<ListSongsResult> {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.status) params.set("status", input.status);
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));

  let response: Response;

  try {
    response = await fetch(`/api/admin/songs?${params.toString()}`);
  } catch {
    throw new ListSongsError(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Something went wrong.";
    throw new ListSongsError(message);
  }

  return body as ListSongsResult;
}
