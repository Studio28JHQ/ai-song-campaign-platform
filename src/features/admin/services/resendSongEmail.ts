export class ResendSongEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResendSongEmailError";
  }
}

/** Thin HTTP client for `POST /api/admin/songs/{songId}/resend-email`. No business rule is evaluated here. */
export async function resendSongEmail(songId: string, reason: string): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`/api/admin/songs/${songId}/resend-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  } catch {
    throw new ResendSongEmailError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Algo salió mal.";
    throw new ResendSongEmailError(message);
  }
}
