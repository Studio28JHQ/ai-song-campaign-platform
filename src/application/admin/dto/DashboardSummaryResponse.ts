import type { AverageGenerationMinutes } from "../contracts/AdminDashboardGate";

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
  /** Sprint ADMIN-1 — Backoffice de Campaña. `CAMPAIGN_MAX_SONGS` ("3000 canciones"), for the goal progress bar. */
  campaignGoal: number;
  averageGenerationMinutes: AverageGenerationMinutes;
  /** The campaign's `maximumSongs` budget, straight from the DB — `null` if no campaign row exists. */
  campaignMaximumSongs: number | null;
  /** The campaign's `songsGenerated` counter — the same field the generation gate enforces against — `null` if no campaign row exists. */
  campaignSongsGenerated: number | null;
}
