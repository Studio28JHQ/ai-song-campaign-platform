/** A single row for the Auditoría screen (Sprint ADMIN-1 — Backoffice de Campaña). */
export interface AuditLogView {
  id: string;
  createdAt: Date;
  /** The acting admin's name, or "Sistema" for a system-recorded event (see `AuditLogEntry` — `adminId: null`). */
  adminName: string;
  action: string;
  entity: string;
  entityId: string | null;
}

/** Input to `ListAuditLogUseCase` — pagination and free-text search (action/entity/entityId) for the "Auditoría" screen. */
export interface ListAuditLogRequest {
  page: number;
  pageSize?: number;
  query?: string;
}

/** Output of `ListAuditLogUseCase`. */
export interface ListAuditLogResponse {
  items: AuditLogView[];
  total: number;
  page: number;
  pageSize: number;
}
