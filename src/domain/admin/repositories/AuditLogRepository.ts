import type { AuditLogEntry } from "../entities/AuditLogEntry";

/**
 * Sprint FINAL-1 — Production Hardening. Pagination and free-text
 * search (against `action`/`entity`/`entityId`) for the "Auditoría"
 * screen — the same shape of concern `AdminLyricsListFilter` already
 * covers for "Letras".
 */
export interface AuditLogSearchFilter {
  page: number;
  pageSize: number;
  query?: string;
}

export interface AuditLogSearchResult {
  items: AuditLogEntry[];
  total: number;
}

/**
 * Persistence contract for the AuditLogEntry aggregate. Interface only —
 * no implementation. A concrete adapter (Prisma or otherwise) belongs in
 * `src/infrastructure/`, not here.
 */
export interface AuditLogRepository {
  create(entry: AuditLogEntry): Promise<AuditLogEntry>;
  findByEntity(entity: string, entityId: string): Promise<AuditLogEntry[]>;
  /** Sprint ADMIN-1 — Backoffice de Campaña; paginated/searchable as of Sprint FINAL-1 — the "Auditoría" screen. */
  findRecent(filter: AuditLogSearchFilter): Promise<AuditLogSearchResult>;
}
