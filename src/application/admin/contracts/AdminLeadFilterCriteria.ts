/** Public song-status vocabulary (see `app/api/song/publicSongStatus.ts`), plus `NONE` for a lead with no song yet — used only for filtering. */
export type AdminLeadSongStatusFilter = "QUEUED" | "GENERATING" | "COMPLETED" | "FAILED" | "NONE";

export type AdminLeadEmailStatusFilter = "SENT" | "NOT_SENT";

/**
 * The filter criteria shared by both the on-screen search table
 * (`AdminLeadSearchGate`) and the CSV export (`AdminLeadExportGate`) — see
 * docs/Product/User_Flow.md — Filters. Search and export must always
 * agree on what a given filter combination matches, so both gates build
 * their `WHERE` clause from this same shape.
 */
export interface AdminLeadFilterCriteria {
  query?: string;
  /** Inclusive lower bound on `Lead.createdAt`. */
  dateFrom?: Date;
  /** Inclusive upper bound on `Lead.createdAt`. */
  dateTo?: Date;
  songStatus?: AdminLeadSongStatusFilter;
  emailStatus?: AdminLeadEmailStatusFilter;
  /** Partial, case-insensitive match against `Lead.city`. */
  city?: string;
}
