/** Public song-status vocabulary (see `app/api/song/publicSongStatus.ts`), used for filtering the "Canciones" list. */
export type AdminSongStatusFilter = "QUEUED" | "GENERATING" | "COMPLETED" | "FAILED";

/**
 * Sprint FINAL-1 — Production Hardening. Pagination, free-text search
 * (parent/baby name), and status filter for the "Canciones" screen —
 * the same shape of concern `AdminLeadSearchFilter` already covers for
 * "Familias".
 */
export interface AdminSongListFilter {
  page: number;
  pageSize: number;
  query?: string;
  status?: AdminSongStatusFilter;
}

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. One row of the admin
 * "Canciones" list — a read model, not a domain entity, the same
 * pattern as `AdminLeadRow` (`AdminLeadSearchGate`).
 */
export interface AdminSongRow {
  id: string;
  leadId: string;
  createdAt: Date;
  parentName: string;
  babyName: string;
  /** Public song-status vocabulary (QUEUED/GENERATING/COMPLETED/FAILED). */
  status: string;
  provider: string;
  musicDirection: string | null;
  audioStorageKey: string | null;
  /** The provider's reported failure reason, if any — surfaced so an operator can triage a `FAILED` song without leaving this screen. */
  providerError: string | null;
  emailedAt: Date | null;
}

export interface AdminSongListResult {
  items: AdminSongRow[];
  total: number;
}

/**
 * What `ListSongsUseCase` needs — a paginated, searchable, filterable
 * join across Song and Lead. No existing repository supports this (the
 * domain `SongRepository` intentionally doesn't, since the pipeline
 * never needs it), so this is a narrow, admin-specific read-model port,
 * satisfied by a thin Prisma-backed adapter in `src/infrastructure/`.
 */
export interface AdminSongListGate {
  list(filter: AdminSongListFilter): Promise<AdminSongListResult>;
}
