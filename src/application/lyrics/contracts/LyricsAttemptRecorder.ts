/**
 * Sprint FINAL-2 — Lyrics Generation Traceability.
 *
 * What the lyrics provider needs in order to leave a durable trace of
 * every call it makes, and nothing more. Purely observational: no method
 * here influences generation, and an implementation may not change what
 * the parent sees.
 *
 * Why this port exists at all, rather than recording from the use case:
 * the retries are *inside* the provider. `ClaudeLyricsService` calls
 * Claude up to three times for one invocation (an over-long lyric is
 * retried without costing the parent an attempt), and the use case never
 * learns that those extra calls happened — it sees one result or one
 * thrown error. Recording from the use case would therefore record at
 * most one row per request and would miss precisely the failures this
 * tracing was built to explain. Recording from the provider costs one
 * inward-pointing dependency and sees every call.
 *
 * ## `attemptNumber` is not `remainingAttempts`
 *
 * These two counters are unrelated and must never be conflated:
 *
 * - **`Lead.remainingAttempts`** — the *functional* attempts the parent
 *   is entitled to (`MAX_LYRIC_ATTEMPTS`, 3 in this campaign). Consumed
 *   by the business rules in
 *   `GenerateLyricsForLeadUseCase`: a rejection or a regeneration costs
 *   one, an approved first generation is free.
 * - **`attemptNumber`** (here) — the ordinal of a *real provider call*
 *   for that lead, counted over the lead's whole lifetime. The first call
 *   ever made for a lead is 1; the automatic `claude.lyrics_too_long`
 *   retry that immediately follows it is 2, even though the parent still
 *   has all their functional attempts.
 *
 * So one functional attempt can produce up to three rows here — one
 * initial call plus at most two internal retries, which is the bound
 * `ClaudeLyricsService` enforces — and three rows here can mean the
 * parent has spent nothing. Neither number can be
 * derived from the other, which is the whole reason both are stored.
 *
 * ## Contract
 *
 * `attemptStarted` is called *before* the provider call and returns an
 * opaque handle; `attemptFinished` closes that same row once the outcome
 * is known. The handle is opaque on purpose — the caller never computes
 * an attempt number (the adapter derives it from what the lead already
 * has, guarded by the table's `@@unique([leadId, attemptNumber])`).
 *
 * Implementations may throw: callers must treat every method as
 * best-effort and must never let a failure here surface to the parent or
 * change the outcome of a generation (see `ClaudeLyricsService`).
 */

/** Every state an attempt row can be in, including the pre-call marker. */
export const LYRICS_ATTEMPT_RESULTS = [
  "STARTED",
  "SUCCESS",
  "MODERATION_REJECTED",
  "FAILED",
] as const;

export type LyricsAttemptResult = (typeof LYRICS_ATTEMPT_RESULTS)[number];

/**
 * The terminal states — what a finished call can have resulted in.
 * `MODERATION_REJECTED` is an outcome, not an error: Claude answered
 * correctly and declined the parent's message, so it carries no
 * `errorCode`.
 */
export type LyricsAttemptOutcome = Exclude<LyricsAttemptResult, "STARTED">;

/** Opaque reference to a row opened by `attemptStarted`. */
export interface LyricsAttemptHandle {
  readonly id: string;
}

export interface LyricsAttemptStart {
  leadId: string;
  /** The provider model actually called, recorded so old rows stay readable. */
  providerModel: string;
}

export interface LyricsAttemptFinish {
  result: LyricsAttemptOutcome;
  /**
   * A normalised, stable failure code for a `FAILED` attempt — never a
   * raw provider code, so the values stay groupable across provider
   * wording changes. `null` for every non-failure.
   */
  errorCode: string | null;
  /**
   * Short human-readable context. Only ever a message this codebase
   * itself wrote: provider error *contexts* are deliberately excluded,
   * since they can contain the raw response text and therefore the
   * parent's own message.
   */
  failureReason: string | null;
}

export interface LyricsAttemptRecorder {
  attemptStarted(input: LyricsAttemptStart): Promise<LyricsAttemptHandle>;
  attemptFinished(handle: LyricsAttemptHandle, outcome: LyricsAttemptFinish): Promise<void>;
}

/**
 * The default recorder: records nothing. Lets `ClaudeLyricsService` stay
 * constructible without persistence (unit tests, and any future caller
 * that has no database), keeping tracing an opt-in of the composition
 * root rather than a hard dependency of the provider.
 */
export const NO_OP_LYRICS_ATTEMPT_RECORDER: LyricsAttemptRecorder = {
  async attemptStarted() {
    return { id: "" };
  },
  async attemptFinished() {},
};
