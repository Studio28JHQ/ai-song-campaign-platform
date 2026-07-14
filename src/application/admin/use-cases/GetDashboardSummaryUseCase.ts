import type { AdminDashboardGate } from "../contracts/AdminDashboardGate";
import type { DashboardSummaryResponse } from "../dto/DashboardSummaryResponse";

/** Loads the four summary counts shown on the Admin Dashboard (see docs/Product/User_Flow.md). No charts, no analytics — just counts. */
export class GetDashboardSummaryUseCase {
  constructor(private readonly dashboardGate: AdminDashboardGate) {}

  async execute(): Promise<DashboardSummaryResponse> {
    return this.dashboardGate.getSummary();
  }
}
