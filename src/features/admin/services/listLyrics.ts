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

export interface ListLyricsInput {
  query?: string;
  page: number;
  pageSize: number;
}

export interface ListLyricsResult {
  items: AdminLyricsRow[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListLyricsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListLyricsError";
  }
}

/** Thin HTTP client for `GET /api/admin/lyrics`. No business rule is evaluated here. */
export async function listLyrics(input: ListLyricsInput): Promise<ListLyricsResult> {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));

  let response: Response;

  try {
    response = await fetch(`/api/admin/lyrics?${params.toString()}`);
  } catch {
    throw new ListLyricsError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Algo salió mal.";
    throw new ListLyricsError(message);
  }

  return body as ListLyricsResult;
}
