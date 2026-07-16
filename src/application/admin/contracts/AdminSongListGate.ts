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
  audioStorageKey: string | null;
  emailedAt: Date | null;
}

/**
 * What `ListSongsUseCase` needs — a join across Song and Lead. No
 * existing repository supports this (the domain `SongRepository`
 * intentionally doesn't, since the pipeline never needs it), so this is
 * a narrow, admin-specific read-model port, satisfied by a thin
 * Prisma-backed adapter in `src/infrastructure/`.
 */
export interface AdminSongListGate {
  list(limit: number): Promise<AdminSongRow[]>;
}
