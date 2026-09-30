/**
 * What `GetDashboardSummaryUseCase` needs to know — nothing more. There
 * is no cross-aggregate "reporting" domain module (out of scope — see
 * PROJECT_MANIFEST.md, BI dashboards/charts/analytics are explicitly
 * excluded from this module), so this is a narrow port over a handful of
 * counts rather than a full aggregate/repository, satisfied by a thin
 * Prisma-backed adapter in `src/infrastructure/`, the same pattern as
 * `CampaignGate`.
 */
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
export type DashboardSection = "core" | "campaign" | "windowCounts" | "dailyTrends" | "shares";

/**
 * Share Tracking — one day's share events, split by platform, for the
 * stacked daily chart. `date` is a campaign day (`YYYY-MM-DD`), the same
 * convention `DailyCount` uses.
 */
export interface DailySharePlatformCount {
  date: string;
  whatsapp: number;
  facebook: number;
  x: number;
}

/**
 * Share Tracking — what the campaign team reads as "compartidos".
 *
 * Every number here counts *recorded share attempts*: our tracking
 * endpoint was reached with a valid token and a known platform. It is
 * not a count of posts published — we never observe what WhatsApp,
 * Facebook or X did — and not strictly a count of humans either, since
 * the links live in email and mail providers and security scanners
 * follow links to inspect them. The admin UI says so in as many words.
 */
export interface ShareCounts {
  total: number;
  whatsapp: number;
  facebook: number;
  x: number;
  /** Distinct families, not songs: each family has exactly one song. */
  familiesShared: number;
  /** Last 30 campaign days, oldest first, zero-filled. */
  sharesByDay: DailySharePlatformCount[];
}

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
  /** The campaign's `maximumSongs` budget, straight from the DB — `null` if no campaign row exists (or that section failed to load). */
  campaignMaximumSongs: number | null;
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
  /** Share Tracking — see `ShareCounts`. Zeroed when the `shares` section fails to load. */
  shares: ShareCounts;
  unavailableSections: DashboardSection[];
}

export interface AdminDashboardGate {
  getSummary(): Promise<DashboardSummaryCounts>;
}
