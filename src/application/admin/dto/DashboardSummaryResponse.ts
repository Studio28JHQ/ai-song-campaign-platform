/** Output of `GetDashboardSummaryUseCase`. Plain indicators — no charts, no trends, no BI. */
export interface DashboardSummaryResponse {
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
  /** `songsCompleted / songsRequested`, as a whole-number percentage (0 when no songs have been requested yet). */
  generationSuccessRate: number;
}
