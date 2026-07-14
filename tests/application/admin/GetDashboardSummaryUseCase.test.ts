import { describe, expect, it, vi } from "vitest";
import { GetDashboardSummaryUseCase } from "@/application/admin/use-cases/GetDashboardSummaryUseCase";
import type { AdminDashboardGate } from "@/application/admin/contracts/AdminDashboardGate";

describe("GetDashboardSummaryUseCase", () => {
  it("returns whatever the dashboard gate reports", async () => {
    const gate: AdminDashboardGate = {
      getSummary: vi.fn().mockResolvedValue({
        totalLeads: 12,
        songsCompleted: 5,
        songsPending: 4,
        songsFailed: 3,
      }),
    };
    const useCase = new GetDashboardSummaryUseCase(gate);

    const result = await useCase.execute();

    expect(result).toEqual({ totalLeads: 12, songsCompleted: 5, songsPending: 4, songsFailed: 3 });
    expect(gate.getSummary).toHaveBeenCalledTimes(1);
  });
});
