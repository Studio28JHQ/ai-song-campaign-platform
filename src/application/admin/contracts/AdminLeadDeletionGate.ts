/**
 * Sprint FINAL-5 — Test Data Cleanup. What deleting one family needs, and
 * nothing else.
 *
 * Deliberately its own port rather than a `delete` on `LeadRepository`:
 * that repository is the public flow's — registration, resume, attempt
 * consumption — and nothing in that flow may ever remove a family. Here
 * the capability is reachable only from the admin module, which is also
 * the only place authorised to use it.
 */
export interface AdminLeadDeletionSummary {
  id: string;
  parentName: string;
  babyName: string;
  email: string;
  /**
   * How many songs go with the family: 0 or 1, since `songs.leadId` is
   * unique. Expressed as a count rather than a flag so the confirmation
   * can state what is actually there without the caller having to know
   * that rule.
   */
  songCount: number;
}

export interface AdminLeadDeletionGate {
  /** The family as the confirmation dialog must describe it, or `null` if it no longer exists. */
  findDeletionSummary(leadId: string): Promise<AdminLeadDeletionSummary | null>;

  /**
   * The storage keys of the family's own audio, read before the delete
   * because afterwards the rows that hold them are gone.
   *
   * Kept apart from the summary on purpose: a storage key is an internal
   * reference that the summary hands to the browser, and there is no
   * reason for it to ever leave the server.
   */
  findAudioStorageKeys(leadId: string): Promise<string[]>;

  /**
   * Removes the family and everything that belongs only to it.
   * Returns `false` when there was no such family — a second click on a
   * stale row is not an error.
   */
  delete(leadId: string): Promise<boolean>;
}
