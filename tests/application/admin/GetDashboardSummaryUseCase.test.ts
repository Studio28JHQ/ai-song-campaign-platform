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
      songsQueued: 1,
      songsGenerating: 1,
      songsCompleted: 5,
      songsFailed: 3,
      emailsSent: 5,
      emailsResent: 2,
      averageGenerationMinutes: { today: null, last7Days: null, last30Days: null },
      campaignMaximumSongs: null,
      campaignSongsGenerated: null,
      songsCompletedToday: 0,
      songsCompletedLast7Days: 1,
      songsCompletedLast30Days: 5,
      registrationsByDay: [],
      completedSongsByDay: [],
      unavailableSections: [],
      ...counts,
    }),
  };
}

describe("GetDashboardSummaryUseCase", () => {
  it("returns the indicators, computing generationSuccessRate from the gate's counts, plus the campaign goal", async () => {
    const gate = fakeGate();
    const useCase = new GetDashboardSummaryUseCase(gate, 3000);

    const result = await useCase.execute();

    expect(result).toEqual({
      totalLeads: 12,
      lyricsGenerated: 15,
      lyricsApproved: 10,
      songsRequested: 8,
      songsQueued: 1,
      songsGenerating: 1,
      songsCompleted: 5,
      songsFailed: 3,
      emailsSent: 5,
      emailsResent: 2,
      generationSuccessRate: 63, // round(5/8 * 100)
      lyricsApprovalRate: 67, // round(10/15 * 100)
      campaignGoal: 3000,
      averageGenerationMinutes: { today: null, last7Days: null, last30Days: null },
      campaignMaximumSongs: null,
      campaignSongsGenerated: null,
      songsCompletedToday: 0,
      songsCompletedLast7Days: 1,
      songsCompletedLast30Days: 5,
      registrationsByDay: [],
      completedSongsByDay: [],
      unavailableSections: [],
    });
    expect(gate.getSummary).toHaveBeenCalledTimes(1);
  });

  it("returns a 0% success rate when no songs have been requested yet, without dividing by zero", async () => {
    const gate = fakeGate({ songsRequested: 0, songsCompleted: 0, songsFailed: 0 });
    const useCase = new GetDashboardSummaryUseCase(gate, 3000);

    const result = await useCase.execute();

    expect(result.generationSuccessRate).toBe(0);
  });

  it("returns a 100% success rate when every requested song completed", async () => {
    const gate = fakeGate({ songsRequested: 4, songsCompleted: 4, songsFailed: 0 });
    const useCase = new GetDashboardSummaryUseCase(gate, 3000);

    const result = await useCase.execute();

    expect(result.generationSuccessRate).toBe(100);
  });

  it("returns a 0% lyrics approval rate when no lyrics have been generated yet, without dividing by zero", async () => {
    const gate = fakeGate({ lyricsGenerated: 0, lyricsApproved: 0 });
    const useCase = new GetDashboardSummaryUseCase(gate, 3000);

    const result = await useCase.execute();

    expect(result.lyricsApprovalRate).toBe(0);
  });

  it("returns a 100% lyrics approval rate when every generated lyrics version was approved", async () => {
    const gate = fakeGate({ lyricsGenerated: 4, lyricsApproved: 4 });
    const useCase = new GetDashboardSummaryUseCase(gate, 3000);

    const result = await useCase.execute();

    expect(result.lyricsApprovalRate).toBe(100);
  });

  it("passes the campaign goal through unchanged when the gate has no campaign row", async () => {
    const gate = fakeGate();
    const useCase = new GetDashboardSummaryUseCase(gate, 500);

    const result = await useCase.execute();

    expect(result.campaignGoal).toBe(500);
  });

  it("prefers the campaign's real maximumSongs over the configured fallback", async () => {
    const gate = fakeGate({ campaignMaximumSongs: 3000, campaignSongsGenerated: 42 });
    const useCase = new GetDashboardSummaryUseCase(gate, 500);

    const result = await useCase.execute();

    expect(result.campaignGoal).toBe(3000);
    expect(result.campaignSongsGenerated).toBe(42);
  });

  it("passes unavailableSections through unchanged (Sprint FINAL-3 — Dashboard Stabilization)", async () => {
    const gate = fakeGate({ unavailableSections: ["campaign", "dailyTrends"] });
    const useCase = new GetDashboardSummaryUseCase(gate, 3000);

    const result = await useCase.execute();

    expect(result.unavailableSections).toEqual(["campaign", "dailyTrends"]);
  });
});
