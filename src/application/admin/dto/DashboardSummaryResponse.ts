/** Output of `GetDashboardSummaryUseCase`. */
export interface DashboardSummaryResponse {
  totalLeads: number;
  songsCompleted: number;
  songsPending: number;
  songsFailed: number;
}
