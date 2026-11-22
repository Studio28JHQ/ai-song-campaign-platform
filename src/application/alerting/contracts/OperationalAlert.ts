/**
 * Operational Alerting. What the campaign team can be told went wrong,
 * and nothing else.
 *
 * Every kind below corresponds to a condition this codebase can already
 * detect at a specific place in the code — there is deliberately no kind
 * for a problem nobody is watching for, because an alert type with no
 * call site is a promise the system does not keep. New kinds are added
 * when a new detection point is added, never in advance.
 */
export const OPERATIONAL_ALERT_KINDS = {
  /**
   * Anthropic rejected the request for a billing reason — an exhausted
   * credit balance or a spend cap. Separated from the generic failure
   * below because it is the one provider failure that never resolves on
   * its own: nothing recovers until somebody adds credit.
   */
  lyricsProviderCreditExhausted: "LYRICS_PROVIDER_CREDIT_EXHAUSTED",
  /**
   * Any other Claude failure that reached a parent as a 503 — an outage,
   * a throttle, a timeout, a malformed answer.
   */
  lyricsProviderUnavailable: "LYRICS_PROVIDER_UNAVAILABLE",
  /** The scheduled pipeline tick threw instead of completing. */
  songPipelineTickFailed: "SONG_PIPELINE_TICK_FAILED",
  /**
   * Songs are waiting and none are finishing. The one condition a family
   * experiences as "my song never arrived" while every individual
   * request still looks like it succeeded.
   */
  songGenerationStalled: "SONG_GENERATION_STALLED",
  /** One song reached its terminal `FAILED` state. */
  songGenerationFailed: "SONG_GENERATION_FAILED",
} as const;

export type OperationalAlertKind =
  (typeof OPERATIONAL_ALERT_KINDS)[keyof typeof OPERATIONAL_ALERT_KINDS];

/**
 * One problem worth an email.
 *
 * `details` is a flat map of small, already-safe values — a status code, a
 * count, an age in minutes, a song id. It is rendered verbatim into the
 * email body, so nothing that could carry a parent's personal data, a
 * lyric, a prompt or a credential may be put in it. The detection sites
 * are the ones responsible for that, the same way
 * `toLyricsAttemptFailureReason` already is for the database.
 */
export interface OperationalAlert {
  kind: OperationalAlertKind;
  /** One line, in Spanish, naming what happened. */
  summary: string;
  /** What the person reading the email should do about it, in Spanish. */
  action: string;
  details?: Record<string, string | number | null>;
}
