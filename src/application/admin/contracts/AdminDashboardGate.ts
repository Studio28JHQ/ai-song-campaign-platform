/**
 * What `GetDashboardSummaryUseCase` needs to know — nothing more. There
 * is no cross-aggregate "reporting" domain module (out of scope — see
 * PROJECT_MANIFEST.md, analytics is explicitly excluded from this
 * module), so this is a narrow port over a handful of counts rather than
 * a full aggregate/repository, satisfied by a thin Prisma-backed adapter
 * in `src/infrastructure/`, the same pattern as `CampaignGate`.
 */
export interface DashboardSummaryCounts {
  totalLeads: number;
  songsCompleted: number;
  songsPending: number;
  songsFailed: number;
}

export interface AdminDashboardGate {
  getSummary(): Promise<DashboardSummaryCounts>;
}
