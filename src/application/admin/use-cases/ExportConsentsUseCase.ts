import type { AdminConsentGate, AdminConsentRow } from "../contracts/AdminConsentGate";

/** Bounded so a single export never holds more than this many rows in memory at once (same value/reasoning as `ExportLeadsUseCase.EXPORT_BATCH_SIZE`). */
export const CONSENT_EXPORT_BATCH_SIZE = 500;

/**
 * Streams every Consent record — the full table, unfiltered and
 * unpaginated per this feature's requirements — as CSV-ready rows, in
 * bounded batches. CSV serialization itself is the route's job; this
 * use case only shapes/streams the data, one batch at a time, never
 * accumulating the full result set (mirrors `ExportLeadsUseCase`).
 */
export class ExportConsentsUseCase {
  constructor(private readonly consentGate: AdminConsentGate) {}

  async *execute(): AsyncGenerator<AdminConsentRow[]> {
    yield* this.consentGate.streamAll(CONSENT_EXPORT_BATCH_SIZE);
  }
}
