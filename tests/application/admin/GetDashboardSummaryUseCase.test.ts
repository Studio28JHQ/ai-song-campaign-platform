import { describe, expect, it, vi } from "vitest";
import { GetDashboardSummaryUseCase } from "@/application/admin/use-cases/GetDashboardSummaryUseCase";
import type { AdminDashboardGate } from "@/application/admin/contracts/AdminDashboardGate";

function fakeGate(
  counts: Partial<Awaited<ReturnType<AdminDashboardGate["getSummary"]>>> = {},
): AdminDashboardGate {
  return {
    getSummary: vi.fn().mockResolvedValue({
      totalLeads: 12,
      lyricsGenerated: 15,
      lyricsApproved: 10,
      songsRequested: 8,
      songsCompleted: 5,
      songsFailed: 3,
      emailsSent: 5,
      emailsResent: 2,
      ...counts,
    }),
  };
}

describe("GetDashboardSummaryUseCase", () => {
  it("returns the nine indicators, computing generationSuccessRate from the gate's counts", async () => {
    const gate = fakeGate();
    const useCase = new GetDashboardSummaryUseCase(gate);

    const result = await useCase.execute();

    expect(result).toEqual({
      totalLeads: 12,
      lyricsGenerated: 15,
      lyricsApproved: 10,
      songsRequested: 8,
      songsCompleted: 5,
      songsFailed: 3,
      emailsSent: 5,
      emailsResent: 2,
      generationSuccessRate: 63, // round(5/8 * 100)
    });
    expect(gate.getSummary).toHaveBeenCalledTimes(1);
  });

  it("returns a 0% success rate when no songs have been requested yet, without dividing by zero", async () => {
    const gate = fakeGate({ songsRequested: 0, songsCompleted: 0, songsFailed: 0 });
    const useCase = new GetDashboardSummaryUseCase(gate);

    const result = await useCase.execute();

    expect(result.generationSuccessRate).toBe(0);
  });

  it("returns a 100% success rate when every requested song completed", async () => {
    const gate = fakeGate({ songsRequested: 4, songsCompleted: 4, songsFailed: 0 });
    const useCase = new GetDashboardSummaryUseCase(gate);

    const result = await useCase.execute();

    expect(result.generationSuccessRate).toBe(100);
  });
});
