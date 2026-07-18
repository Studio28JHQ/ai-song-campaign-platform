/**
 * Sprint FINAL-2 — Campaign Operations Dashboard. The six event kinds
 * the "Actividad reciente" panel shows, synthesized entirely from
 * existing Lead/Lyrics/Song timestamps plus the existing `AuditLog`
 * table's `resend_email` entries — no new table, no new column.
 */
export type RecentActivityEventType =
  | "lead_registered"
  | "lyrics_generated"
  | "lyrics_approved"
  | "song_completed"
  | "email_sent"
  | "email_resent";

/** One event row for the "Actividad reciente" panel — a read model, not a domain entity. */
export interface RecentActivityRow {
  type: RecentActivityEventType;
  timestamp: Date;
  leadId: string;
  parentName: string;
  babyName: string;
}

/**
 * What `ListRecentActivityUseCase` needs — the most recent events
 * merged across Lead/Lyrics/Song/AuditLog, newest first. No existing
 * repository supports this shape (it's a merge across four sources,
 * not a single-table query), so this is a narrow, admin-specific
 * read-model port, the same pattern as `AdminDashboardGate`.
 */
export interface AdminRecentActivityGate {
  list(limit: number): Promise<RecentActivityRow[]>;
}
