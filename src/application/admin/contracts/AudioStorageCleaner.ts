/**
 * Sprint FINAL-5 — Test Data Cleanup. Removing one stored audio object,
 * and nothing else.
 *
 * Deliberately not a `delete` added to `AudioStorage`: that port belongs
 * to the generation path, which only ever writes. Keeping deletion in a
 * separate, admin-only contract means nothing in the pipeline can reach
 * it, by construction rather than by convention.
 *
 * Satisfied structurally by `CloudflareR2Storage`, which has had this
 * exact method all along and had no caller until now.
 */
export interface AudioStorageCleaner {
  delete(key: string): Promise<void>;
}
