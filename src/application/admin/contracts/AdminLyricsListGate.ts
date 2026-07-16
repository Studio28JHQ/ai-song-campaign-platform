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

/**
 * What `ListLyricsUseCase` needs — a join across Lyrics, Lead, and
 * Mood. No existing repository supports this (the domain
 * `LyricsRepository` intentionally doesn't), so this is a narrow,
 * admin-specific read-model port, the same pattern as
 * `AdminSongListGate`.
 */
export interface AdminLyricsListGate {
  list(limit: number): Promise<AdminLyricsRow[]>;
}
