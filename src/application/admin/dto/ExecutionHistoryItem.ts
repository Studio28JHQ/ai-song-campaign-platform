/**
 * One entry in the Lead Detail screen's "complete execution history"
 * (see docs/Product/User_Flow.md — Operational Recovery). Unifies two
 * kinds of source data into a single read-only timeline:
 *
 * - System events synthesized from timestamps already present on the
 *   Lead/Lyrics/Song aggregates (`actor: null`) — no new writes anywhere.
 * - Real `AuditLogEntry` rows for admin-initiated actions (`actor` is
 *   the acting admin's id): viewing the lead, retrying a failed song,
 *   and manually resending the delivery email.
 */
export type ExecutionHistoryEventType =
  | "lead_created"
  | "lyrics_generated"
  | "lyrics_approved"
  | "song_requested"
  | "song_completed"
  | "song_failed"
  | "email_sent_automatic"
  | "email_resent_manual"
  | "song_retried"
  | "lead_viewed";

export interface ExecutionHistoryItem {
  type: ExecutionHistoryEventType;
  label: string;
  timestamp: Date;
  /** The acting admin's id, or `null` for a system/automatic event. */
  actor: string | null;
  /** Extra context — currently only the reason on a manual email resend. */
  detail?: string | null;
}
