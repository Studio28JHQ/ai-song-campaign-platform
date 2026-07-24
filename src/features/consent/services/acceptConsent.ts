export class ConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsentError";
  }
}

/** Thin HTTP client for the privacy consent banner (Feature 2 — Privacy Consent Module). No business rule is evaluated here. */
export async function acceptConsent(): Promise<void> {
  let response: Response;

  try {
    response = await fetch("/api/consent", { method: "POST" });
  } catch {
    throw new ConsentError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }

  if (!response.ok) {
    throw new ConsentError("No pudimos guardar tu preferencia. Inténtalo de nuevo.");
  }
}
