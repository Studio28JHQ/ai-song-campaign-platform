/**
 * What `GetDashboardSummaryUseCase` needs to know — nothing more. There
 * is no cross-aggregate "reporting" domain module (out of scope — see
 * PROJECT_MANIFEST.md, BI dashboards/charts/analytics are explicitly
 * excluded from this module), so this is a narrow port over a handful of
 * counts rather than a full aggregate/repository, satisfied by a thin
 * Prisma-backed adapter in `src/infrastructure/`, the same pattern as
 * `CampaignGate`.
 */
export interface DashboardSummaryCounts {
  totalLeads: number;
  lyricsGenerated: number;
  lyricsApproved: number;
  songsRequested: number;
  songsCompleted: number;
  songsFailed: number;
  emailsSent: number;
  emailsResent: number;
}

export interface AdminDashboardGate {
  getSummary(): Promise<DashboardSummaryCounts>;
}
