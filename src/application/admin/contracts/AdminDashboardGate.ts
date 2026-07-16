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
}

export interface AdminDashboardGate {
  getSummary(): Promise<DashboardSummaryCounts>;
}
