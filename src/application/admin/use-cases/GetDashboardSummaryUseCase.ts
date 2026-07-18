import type { AdminDashboardGate } from "../contracts/AdminDashboardGate";
import type { DashboardSummaryResponse } from "../dto/DashboardSummaryResponse";

/**
 * Loads the summary indicators shown on the Admin Dashboard (see
 * docs/Product/User_Flow.md). No charts engine, no analytics module —
 * just counts, plus derived percentages (`generationSuccessRate`,
 * `lyricsApprovalRate`) computed here rather than in the Prisma
 * adapter, since they're arithmetic over the gate's own counts, not a
 * query.
 *
 * `campaignMaxSongs` (Sprint ADMIN-1 — "3000 canciones") is passed in
 * rather than read from `appConfig` here, so this use case stays a
 * plain function of its dependencies — the composition root
 * (`app/api/admin/dashboard/route.ts`) is the one place config is read.
 */
export class GetDashboardSummaryUseCase {
  constructor(
    private readonly dashboardGate: AdminDashboardGate,
    private readonly campaignMaxSongs: number,
  ) {}

  async execute(): Promise<DashboardSummaryResponse> {
    const counts = await this.dashboardGate.getSummary();

    const generationSuccessRate =
      counts.songsRequested > 0
        ? Math.round((counts.songsCompleted / counts.songsRequested) * 100)
        : 0;

    const lyricsApprovalRate =
      counts.lyricsGenerated > 0
        ? Math.round((counts.lyricsApproved / counts.lyricsGenerated) * 100)
        : 0;

    return {
      ...counts,
      generationSuccessRate,
      lyricsApprovalRate,
      campaignGoal: counts.campaignMaximumSongs ?? this.campaignMaxSongs,
    };
  }
}
