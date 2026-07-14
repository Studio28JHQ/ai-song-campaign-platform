import type { AdminLeadFilterCriteria } from "./AdminLeadFilterCriteria";

/** One row of the CSV export — a read model, not a domain entity. */
export interface AdminLeadExportRow {
  parentName: string;
  babyName: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  lyricsStatus: "NONE" | "GENERATED" | "APPROVED";
  /** Public song-status vocabulary (PENDING/GENERATING/COMPLETED/FAILED), or `null` if no song has been started yet. */
  songStatus: string | null;
  emailStatus: "SENT" | "NOT_SENT";
  generatedAt: Date | null;
  emailedAt: Date | null;
}

/**
 * What `ExportLeadsUseCase` needs — every Lead matching the same filter
 * criteria the search table uses (see `AdminLeadSearchGate`), but
 * streamed in bounded batches rather than one page at a time, since an
 * export must cover the whole filtered result set without ever loading
 * it entirely into memory (see docs/Product/User_Flow.md — Performance).
 */
export interface AdminLeadExportGate {
  streamRows(
    filter: AdminLeadFilterCriteria,
    batchSize: number,
  ): AsyncIterable<AdminLeadExportRow[]>;
}
