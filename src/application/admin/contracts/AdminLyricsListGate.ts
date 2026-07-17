/**
 * Sprint FINAL-1 — Production Hardening. Pagination and free-text
 * search (parent/baby name) for the "Letras" screen — the same shape
 * of concern `AdminSongListFilter` already covers for "Canciones".
 */
export interface AdminLyricsListFilter {
  page: number;
  pageSize: number;
  query?: string;
}

/** One row of the admin "Letras" list — a read model, not a domain entity. */
export interface AdminLyricsRow {
  id: string;
  leadId: string;
  createdAt: Date;
  parentName: string;
  babyName: string;
  moodName: string;
  version: number;
  approved: boolean;
  rejectionReason: string | null;
}

export interface AdminLyricsListResult {
  items: AdminLyricsRow[];
  total: number;
}

/**
 * What `ListLyricsUseCase` needs — a paginated, searchable join across
 * Lyrics, Lead, and Mood. No existing repository supports this (the
 * domain `LyricsRepository` intentionally doesn't), so this is a
 * narrow, admin-specific read-model port, the same pattern as
 * `AdminSongListGate`.
 */
export interface AdminLyricsListGate {
  list(filter: AdminLyricsListFilter): Promise<AdminLyricsListResult>;
}
