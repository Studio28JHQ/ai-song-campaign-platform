/**
 * What `GetDashboardSummaryUseCase` needs to know — nothing more. There
 * is no cross-aggregate "reporting" domain module (out of scope — see
 * PROJECT_MANIFEST.md, BI dashboards/charts/analytics are explicitly
 * excluded from this module), so this is a narrow port over a handful of
 * counts rather than a full aggregate/repository, satisfied by a thin
 * Prisma-backed adapter in `src/infrastructure/`, the same pattern as
 * `CampaignGate`.
 */
/**
 * Sprint ADMIN-1 — Backoffice de Campaña. Average minutes between
 * `Song.submittedAt` and `Song.completedAt`, over `COMPLETED` songs
 * whose `completedAt` falls in the given window — `null` when no song
 * completed in that window yet ("Display average times when
 * available. Otherwise show 'No disponible'. Do not fail.").
 */
export interface AverageGenerationMinutes {
  today: number | null;
  last7Days: number | null;
  last30Days: number | null;
}

/** Sprint FINAL-2 — Campaign Operations Dashboard. One day's count for a 30-day trend chart — `date` as `YYYY-MM-DD`. */
export interface DailyCount {
  date: string;
  count: number;
}

/**
 * Sprint FINAL-3 — Dashboard Stabilization. The Dashboard's independently-
 * loadable widgets. `PrismaAdminDashboardGate` loads each of the queries
 * feeding these sections in isolation (never one giant all-or-nothing
 * batch), so a single failing query degrades only its own widget —
 * see `unavailableSections` on `DashboardSummaryCounts`.
 */
export type DashboardSection =
  "core" | "generationTime" | "campaign" | "windowCounts" | "dailyTrends";

export interface DashboardSummaryCounts {
  totalLeads: number;
  lyricsGenerated: number;
  lyricsApproved: number;
  songsRequested: number;
  songsQueued: number;
  songsGenerating: number;
  songsCompleted: number;
  songsFailed: number;
  emailsSent: number;
  emailsResent: number;
  averageGenerationMinutes: AverageGenerationMinutes;
  /** The campaign's `maximumSongs` budget, straight from the DB — `null` if no campaign row exists (or that section failed to load). */
  campaignMaximumSongs: number | null;
  /** The campaign's `songsGenerated` counter — the same field the generation gate enforces against — `null` if no campaign row exists (or that section failed to load). */
  campaignSongsGenerated: number | null;
  /** New leads registered per day, oldest first, over the last 30 days (including days with zero). */
  registrationsByDay: DailyCount[];
  /** Songs completed per day, oldest first, over the last 30 days (including days with zero). */
  completedSongsByDay: DailyCount[];
  /** Songs completed since the start of today. */
  songsCompletedToday: number;
  /** Songs completed in the last 7 days. */
  songsCompletedLast7Days: number;
  /** Songs completed in the last 30 days. */
  songsCompletedLast30Days: number;
  /**
   * Sprint FINAL-3 — Dashboard Stabilization. Which sections, if any,
   * failed to load — that section's fields above are safe zero/null
   * defaults, not real data. Empty when everything loaded normally.
   * The real cause of each failure is always logged server-side (see
   * `PrismaAdminDashboardGate`), never only swallowed here.
   */
  unavailableSections: DashboardSection[];
}

export interface AdminDashboardGate {
  getSummary(): Promise<DashboardSummaryCounts>;
}
