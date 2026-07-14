export type LeadSongStatusFilter = "QUEUED" | "GENERATING" | "COMPLETED" | "FAILED" | "NONE";
export type LeadEmailStatusFilter = "SENT" | "NOT_SENT";

/** Filter criteria shared by the participants search table and the CSV export — see docs/Product/User_Flow.md — Filters. */
export interface LeadFilterCriteria {
  query?: string;
  /** `yyyy-mm-dd`, as produced by an `<input type="date">`. */
  dateFrom?: string;
  dateTo?: string;
  songStatus?: LeadSongStatusFilter;
  emailStatus?: LeadEmailStatusFilter;
  city?: string;
}

export function appendLeadFilterParams(params: URLSearchParams, filters: LeadFilterCriteria): void {
  if (filters.query) params.set("q", filters.query);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.songStatus) params.set("songStatus", filters.songStatus);
  if (filters.emailStatus) params.set("emailStatus", filters.emailStatus);
  if (filters.city) params.set("city", filters.city);
}
