import type { AdminDashboardGate } from "../contracts/AdminDashboardGate";
import type { DashboardSummaryResponse } from "../dto/DashboardSummaryResponse";

/**
 * Loads the summary indicators shown on the Admin Dashboard (see
 * docs/Product/User_Flow.md). No charts, no analytics — just counts,
 * plus one derived percentage (`generationSuccessRate`) computed here
 * rather than in the Prisma adapter, since it's arithmetic over two of
 * the gate's own counts, not a query.
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

    return {
      ...counts,
      generationSuccessRate,
      campaignGoal: counts.campaignMaximumSongs ?? this.campaignMaxSongs,
    };
  }
}
