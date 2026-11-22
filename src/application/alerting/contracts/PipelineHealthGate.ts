/**
 * Operational Alerting. The three numbers needed to answer "are songs
 * still being generated?" — read in one place so the stall detector never
 * grows its own queries.
 *
 * Deliberately not part of `SongRepository`: that port exists to load and
 * persist one Song for the generation flow, and these are aggregate
 * counts for monitoring. Same separation the Dashboard already makes with
 * `AdminDashboardGate`.
 */
export interface PipelineHealthSnapshot {
  /** Songs in `QUEUED` or `GENERATING` right now. */
  pendingCount: number;
  /**
   * When the oldest of those entered the system (`Song.createdAt`), or
   * `null` when nothing is pending.
   */
  oldestPendingAt: Date | null;
  /** When a song last reached `COMPLETED`, or `null` if none ever has. */
  lastCompletedAt: Date | null;
}

export interface PipelineHealthGate {
  getPipelineHealth(): Promise<PipelineHealthSnapshot>;
}
