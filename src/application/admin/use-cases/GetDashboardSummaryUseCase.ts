import type { AdminDashboardGate } from "../contracts/AdminDashboardGate";
import type { DashboardSummaryResponse } from "../dto/DashboardSummaryResponse";

/**
 * Loads the nine summary indicators shown on the Admin Dashboard (see
 * docs/Product/User_Flow.md). No charts, no analytics — just counts, plus
 * one derived percentage (`generationSuccessRate`) computed here rather
 * than in the Prisma adapter, since it's arithmetic over two of the
 * gate's own counts, not a query.
 */
export class GetDashboardSummaryUseCase {
  constructor(private readonly dashboardGate: AdminDashboardGate) {}

  async execute(): Promise<DashboardSummaryResponse> {
    const counts = await this.dashboardGate.getSummary();

    const generationSuccessRate =
      counts.songsRequested > 0
        ? Math.round((counts.songsCompleted / counts.songsRequested) * 100)
        : 0;

    return { ...counts, generationSuccessRate };
  }
}
