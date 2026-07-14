import type { AdminLeadExportGate, AdminLeadExportRow } from "../contracts/AdminLeadExportGate";
import type { ExportLeadsRequest } from "../dto/ExportLeadsRequest";
import { validateDateRange } from "../validateDateRange";

/** Bounded so a single export never holds more than this many rows in memory at once (see docs/Product/User_Flow.md — Performance). */
export const EXPORT_BATCH_SIZE = 500;

/**
 * Streams every Lead matching the given filters — the same filter
 * criteria the search table uses (see `SearchLeadsUseCase`) — as
 * CSV-ready rows, in bounded batches. CSV serialization itself is the
 * route's job; this use case only validates the filters and shapes/
 * streams the data, one batch at a time, never accumulating the full
 * result set.
 */
export class ExportLeadsUseCase {
  constructor(private readonly exportGate: AdminLeadExportGate) {}

  async *execute(request: ExportLeadsRequest): AsyncGenerator<AdminLeadExportRow[]> {
    validateDateRange(request.dateFrom, request.dateTo);

    yield* this.exportGate.streamRows(
      {
        query: request.query?.trim() || undefined,
        dateFrom: request.dateFrom,
        dateTo: request.dateTo,
        songStatus: request.songStatus,
        emailStatus: request.emailStatus,
        city: request.city?.trim() || undefined,
      },
      EXPORT_BATCH_SIZE,
    );
  }
}
