export interface RetrySongResult {
  songId: string;
  status: string;
}

export class RetrySongError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrySongError";
  }
}

/** Thin HTTP client for `POST /api/admin/songs/{songId}/retry`. No business rule is evaluated here. */
export async function retrySong(songId: string): Promise<RetrySongResult> {
  let response: Response;

  try {
    response = await fetch(`/api/admin/songs/${songId}/retry`, { method: "POST" });
  } catch {
    throw new RetrySongError(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Something went wrong.";
    throw new RetrySongError(message);
  }

  return body as RetrySongResult;
}
