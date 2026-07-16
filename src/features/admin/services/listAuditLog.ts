export interface AuditLogRow {
  id: string;
  createdAt: string;
  adminName: string;
  action: string;
  entity: string;
  entityId: string | null;
}

export interface ListAuditLogResult {
  items: AuditLogRow[];
}

export class ListAuditLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListAuditLogError";
  }
}

/** Thin HTTP client for `GET /api/admin/audit`. No business rule is evaluated here. */
export async function listAuditLog(): Promise<ListAuditLogResult> {
  let response: Response;

  try {
    response = await fetch("/api/admin/audit");
  } catch {
    throw new ListAuditLogError(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Something went wrong.";
    throw new ListAuditLogError(message);
  }

  return body as ListAuditLogResult;
}
