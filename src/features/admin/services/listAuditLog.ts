export interface AuditLogRow {
  id: string;
  createdAt: string;
  adminName: string;
  action: string;
  entity: string;
  entityId: string | null;
}

export interface ListAuditLogInput {
  query?: string;
  page: number;
  pageSize: number;
}

export interface ListAuditLogResult {
  items: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListAuditLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListAuditLogError";
  }
}

/** Thin HTTP client for `GET /api/admin/audit`. No business rule is evaluated here. */
export async function listAuditLog(input: ListAuditLogInput): Promise<ListAuditLogResult> {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));

  let response: Response;

  try {
    response = await fetch(`/api/admin/audit?${params.toString()}`);
  } catch {
    throw new ListAuditLogError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Algo salió mal.";
    throw new ListAuditLogError(message);
  }

  return body as ListAuditLogResult;
}
