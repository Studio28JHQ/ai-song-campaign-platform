export type SongStatusValue = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";

export interface SongStatusResult {
  songId: string;
  status: SongStatusValue;
  audioUrl?: string;
  duration?: number | null;
}

export class GetSongStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GetSongStatusError";
  }
}

/**
 * Thin HTTP client for `GET /api/song/{songId}` — the polling endpoint.
 * No business rule is evaluated here.
 */
export async function getSongStatus(songId: string): Promise<SongStatusResult> {
  let response: Response;

  try {
    response = await fetch(`/api/song/${songId}`);
  } catch {
    throw new GetSongStatusError(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Something went wrong.";
    throw new GetSongStatusError(message);
  }

  return body as SongStatusResult;
}
