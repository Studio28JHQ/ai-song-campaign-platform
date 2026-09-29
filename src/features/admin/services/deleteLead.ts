export interface DeleteLeadResult {
  deleted: {
    id: string;
    parentName: string;
    babyName: string;
    email: string;
    songCount: number;
  };
}

export class DeleteLeadError extends Error {
  constructor(
    message: string,
    public readonly notFound: boolean = false,
  ) {
    super(message);
    this.name = "DeleteLeadError";
  }
}

/** Thin HTTP client for `DELETE /api/admin/leads/{leadId}`. No business rule is evaluated here. */
export async function deleteLead(leadId: string): Promise<DeleteLeadResult> {
  let response: Response;

  try {
    response = await fetch(`/api/admin/leads/${leadId}`, { method: "DELETE" });
  } catch {
    throw new DeleteLeadError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown; message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Algo salió mal.";
    throw new DeleteLeadError(message, record.error === "lead_not_found");
  }

  return body as DeleteLeadResult;
}
