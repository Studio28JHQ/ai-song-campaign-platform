import type { LyricsAttemptResult } from "@/application/lyrics/contracts/LyricsAttemptRecorder";

/**
 * Sprint FINAL-2 — Lyrics Generation Traceability. The admin panel's
 * read-only view of a lead's recorded lyrics-generation attempts.
 *
 * Separate from `LyricsAttemptRecorder` on purpose: that port is the
 * write side, injected into the generation path, and nothing in the
 * generation path should be able to read attempt history. This one is a
 * read gate like the other admin gates — no domain entity, no behaviour,
 * just the rows a human needs in order to answer "what happened to this
 * family's lyrics?".
 */
export interface AdminLyricsAttemptView {
  /**
   * The lead's Nth *real provider call*, ever — not the parent's
   * functional attempt number (`Lead.remainingAttempts`). An internally
   * retried over-long lyric produces two of these for one functional
   * attempt; see `LyricsAttemptRecorder`.
   */
  attemptNumber: number;
  /**
   * `STARTED` means the call was opened and never closed. Recent means
   * in flight; old means the request died mid-call (a timeout, a killed
   * invocation). Nothing rewrites it, so this screen presents it as-is.
   */
  result: LyricsAttemptResult;
  /** Normalised failure code — `null` for anything that is not a `FAILED` attempt. */
  errorCode: string | null;
  failureReason: string | null;
  /** The provider model that produced the row; `null` for rows written before it was recorded. */
  providerModel: string | null;
  createdAt: Date;
  /** When the call returned — `null` while `STARTED`. */
  completedAt: Date | null;
}

export interface AdminLyricsAttemptGate {
  findByLead(leadId: string): Promise<AdminLyricsAttemptView[]>;
}
