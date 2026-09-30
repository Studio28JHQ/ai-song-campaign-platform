import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminDashboardGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminDashboardGate";
import { logger } from "@/shared/logger/logger";

function fakeClient(counts: {
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
  songsCompletedToday?: number;
  songsCompletedLast7Days?: number;
  songsCompletedLast30Days?: number;
  completedSongs?: Array<{ submittedAt: Date; completedAt: Date }>;
  registrations?: Array<{ createdAt: Date }>;
  campaign?: { maximumSongs: number; songsGenerated: number } | null;
}): PrismaClient {
  const leadCount = vi.fn().mockResolvedValue(counts.totalLeads);
  const leadFindMany = vi.fn().mockResolvedValue(counts.registrations ?? []);
  const lyricsCount = vi
    .fn()
    .mockResolvedValueOnce(counts.lyricsGenerated)
    .mockResolvedValueOnce(counts.lyricsApproved);
  const songCount = vi
    .fn()
    .mockResolvedValueOnce(counts.songsRequested)
    .mockResolvedValueOnce(counts.songsQueued)
    .mockResolvedValueOnce(counts.songsGenerating)
    .mockResolvedValueOnce(counts.songsCompleted)
    .mockResolvedValueOnce(counts.songsFailed)
    .mockResolvedValueOnce(counts.emailsSent)
    .mockResolvedValueOnce(counts.songsCompletedToday ?? 0)
    .mockResolvedValueOnce(counts.songsCompletedLast7Days ?? 0)
    .mockResolvedValueOnce(counts.songsCompletedLast30Days ?? 0);
  const auditLogCount = vi.fn().mockResolvedValue(counts.emailsResent);
  const songFindMany = vi.fn().mockResolvedValue(counts.completedSongs ?? []);
  const campaignFindFirst = vi.fn().mockResolvedValue(counts.campaign ?? null);

  return {
    lead: { count: leadCount, findMany: leadFindMany },
    lyrics: { count: lyricsCount },
    song: { count: songCount, findMany: songFindMany },
    // Share Tracking — the two aggregates the gate runs for the shares
    // section. Defaulted to empty so every existing assertion keeps
    // describing the behaviour it was written for.
    shareEvent: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    auditLog: { count: auditLogCount },
    campaign: { findFirst: campaignFindFirst },
  } as unknown as PrismaClient;
}

describe("PrismaAdminDashboardGate.getSummary", () => {
  it("returns the dashboard indicators as plain counts, with no completed songs in any window", async () => {
    const client = fakeClient({
      totalLeads: 10,
      lyricsGenerated: 12,
      lyricsApproved: 8,
      songsRequested: 7,
      songsQueued: 1,
      songsGenerating: 1,
      songsCompleted: 4,
      songsFailed: 2,
      emailsSent: 4,
      emailsResent: 1,
    });
    const gate = new PrismaAdminDashboardGate(client);

    const summary = await gate.getSummary();

    expect(summary).toEqual({
      totalLeads: 10,
      lyricsGenerated: 12,
      lyricsApproved: 8,
      songsRequested: 7,
      songsQueued: 1,
      songsGenerating: 1,
      songsCompleted: 4,
      songsFailed: 2,
      emailsSent: 4,
      emailsResent: 1,
      campaignMaximumSongs: null,
      songsCompletedToday: 0,
      songsCompletedLast7Days: 0,
      songsCompletedLast30Days: 0,
      registrationsByDay: expect.any(Array),
      completedSongsByDay: expect.any(Array),
      // Share Tracking — no events recorded in this fixture.
      shares: {
        total: 0,
        whatsapp: 0,
        facebook: 0,
        x: 0,
        familiesShared: 0,
        sharesByDay: expect.any(Array),
      },
      unavailableSections: [],
    });
  });

  it("returns the campaign's real maximumSongs when a campaign row exists, and no stored tally", async () => {
    const client = fakeClient({
      totalLeads: 1,
      lyricsGenerated: 1,
      lyricsApproved: 1,
      songsRequested: 1,
      songsQueued: 0,
      songsGenerating: 0,
      songsCompleted: 1,
      songsFailed: 0,
      emailsSent: 1,
      emailsResent: 0,
      campaign: { maximumSongs: 3000, songsGenerated: 42 },
    });
    const gate = new PrismaAdminDashboardGate(client);

    const summary = await gate.getSummary();

    expect(summary.campaignMaximumSongs).toBe(3000);
    // Sprint FINAL-6 — Derived Campaign Capacity: `songsGenerated` is a
    // historical tally and no longer travels to the panel.
    expect(summary).not.toHaveProperty("campaignSongsGenerated");
  });

  it("counts resent emails via AuditLog entries with action resend_email", async () => {
    const client = fakeClient({
      totalLeads: 1,
      lyricsGenerated: 1,
      lyricsApproved: 1,
      songsRequested: 1,
      songsQueued: 0,
      songsGenerating: 0,
      songsCompleted: 1,
      songsFailed: 0,
      emailsSent: 1,
      emailsResent: 3,
    });
    const gate = new PrismaAdminDashboardGate(client);

    await gate.getSummary();

    expect(client.auditLog.count).toHaveBeenCalledWith({ where: { action: "resend_email" } });
  });

  it("returns the per-window completed-song counts (hoy/7 días/30 días)", async () => {
    const client = fakeClient({
      totalLeads: 1,
      lyricsGenerated: 1,
      lyricsApproved: 1,
      songsRequested: 5,
      songsQueued: 0,
      songsGenerating: 0,
      songsCompleted: 5,
      songsFailed: 0,
      emailsSent: 5,
      emailsResent: 0,
      songsCompletedToday: 1,
      songsCompletedLast7Days: 3,
      songsCompletedLast30Days: 5,
    });
    const gate = new PrismaAdminDashboardGate(client);

    const summary = await gate.getSummary();

    expect(summary.songsCompletedToday).toBe(1);
    expect(summary.songsCompletedLast7Days).toBe(3);
    expect(summary.songsCompletedLast30Days).toBe(5);
  });

  it("buckets registrations and completed songs into one zero-filled entry per day for the last 30 days", async () => {
    const today = new Date();
    const client = fakeClient({
      totalLeads: 2,
      lyricsGenerated: 1,
      lyricsApproved: 1,
      songsRequested: 1,
      songsQueued: 0,
      songsGenerating: 0,
      songsCompleted: 1,
      songsFailed: 0,
      emailsSent: 1,
      emailsResent: 0,
      registrations: [{ createdAt: today }, { createdAt: today }],
      completedSongs: [{ submittedAt: today, completedAt: today }],
    });
    const gate = new PrismaAdminDashboardGate(client);

    const summary = await gate.getSummary();

    const campaignDay = (at: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Guayaquil",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(at);

    expect(summary.registrationsByDay).toHaveLength(31); // inclusive of today, 30 days back
    expect(summary.registrationsByDay.at(-1)).toEqual({ date: campaignDay(today), count: 2 });
    expect(summary.completedSongsByDay).toHaveLength(31);
    expect(summary.completedSongsByDay.at(-1)).toEqual({ date: campaignDay(today), count: 1 });
  });

  /**
   * Sprint FINAL-7 — Dashboard Charts. Days are the campaign's, not UTC's.
   *
   * It used to bucket in UTC, so a family that registered at 00:30 UTC
   * landed in the bar an operator reads as the next day — while the
   * Familias table, rendering the same timestamp in `America/Guayaquil`,
   * showed it as the previous evening. The same event sat on two different
   * days in two places on the same screen.
   */
  it("assigns an event near midnight UTC to the campaign day it actually happened on", async () => {
    // 2026-09-29 00:30 UTC is 2026-09-28 19:30 in Ecuador.
    const justAfterUtcMidnight = new Date("2026-09-29T00:30:00.000Z");
    // 2026-09-29 05:00 UTC is exactly 2026-09-29 00:00 in Ecuador.
    const firstMomentOfTheLocalDay = new Date("2026-09-29T05:00:00.000Z");
    // One second earlier is still the previous local day.
    const lastMomentOfThePreviousDay = new Date("2026-09-29T04:59:59.000Z");

    const client = fakeClient({
      totalLeads: 3,
      lyricsGenerated: 0,
      lyricsApproved: 0,
      songsRequested: 0,
      songsQueued: 0,
      songsGenerating: 0,
      songsCompleted: 0,
      songsFailed: 0,
      emailsSent: 0,
      emailsResent: 0,
      registrations: [
        { createdAt: justAfterUtcMidnight },
        { createdAt: lastMomentOfThePreviousDay },
        { createdAt: firstMomentOfTheLocalDay },
      ],
      completedSongs: [{ submittedAt: justAfterUtcMidnight, completedAt: justAfterUtcMidnight }],
    });
    const gate = new PrismaAdminDashboardGate(client);

    const summary = await gate.getSummary();

    const on = (series: Array<{ date: string; count: number }>, day: string) =>
      series.find((entry) => entry.date === day)?.count;

    // Two of the three fell on the 28th locally, one on the 29th — which is
    // not how UTC would have split them (UTC puts all three on the 29th).
    expect(on(summary.registrationsByDay, "2026-09-28")).toBe(2);
    expect(on(summary.registrationsByDay, "2026-09-29")).toBe(1);
    expect(on(summary.completedSongsByDay, "2026-09-28")).toBe(1);
    expect(on(summary.completedSongsByDay, "2026-09-29")).toBe(0);
  });

  describe("partial-failure resilience (Sprint FINAL-3 — Dashboard Stabilization)", () => {
    it("keeps every other section working, and reports 'core' as unavailable, when one core count query fails", async () => {
      const client = fakeClient({
        totalLeads: 10,
        lyricsGenerated: 12,
        lyricsApproved: 8,
        songsRequested: 7,
        songsQueued: 1,
        songsGenerating: 1,
        songsCompleted: 4,
        songsFailed: 2,
        emailsSent: 4,
        emailsResent: 1,
        campaign: { maximumSongs: 3000, songsGenerated: 42 },
      });
      // The very first `lead.count()` call fails; every other query keeps its normal mock.
      vi.mocked(client.lead.count).mockReset().mockRejectedValueOnce(new Error("connection lost"));

      const gate = new PrismaAdminDashboardGate(client);
      const summary = await gate.getSummary();

      expect(summary.unavailableSections).toEqual(["core"]);
      expect(summary.totalLeads).toBe(0); // safe fallback, not a thrown error
      // Everything outside "core" still loaded normally.
      expect(summary.campaignMaximumSongs).toBe(3000);
    });

    it("logs the real underlying error for the failed query — never silently swallowed", async () => {
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const client = fakeClient({
        totalLeads: 1,
        lyricsGenerated: 1,
        lyricsApproved: 1,
        songsRequested: 1,
        songsQueued: 0,
        songsGenerating: 0,
        songsCompleted: 1,
        songsFailed: 0,
        emailsSent: 1,
        emailsResent: 0,
      });
      vi.mocked(client.campaign.findFirst).mockRejectedValueOnce(
        new Error('relation "campaign" does not exist'),
      );

      const gate = new PrismaAdminDashboardGate(client);
      await gate.getSummary();

      expect(errorSpy).toHaveBeenCalledWith(
        "Dashboard widget query failed — using a safe fallback for this section",
        expect.objectContaining({
          section: "campaign",
          query: "campaign.findFirst",
          error: 'relation "campaign" does not exist',
        }),
      );
      errorSpy.mockRestore();
    });

    it("reports each independently-failing section, and still returns a usable summary when several fail at once", async () => {
      const client = fakeClient({
        totalLeads: 1,
        lyricsGenerated: 1,
        lyricsApproved: 1,
        songsRequested: 1,
        songsQueued: 0,
        songsGenerating: 0,
        songsCompleted: 1,
        songsFailed: 0,
        emailsSent: 1,
        emailsResent: 0,
      });
      vi.mocked(client.campaign.findFirst).mockRejectedValueOnce(new Error("timeout"));
      vi.mocked(client.lead.findMany).mockRejectedValueOnce(new Error("timeout"));

      const gate = new PrismaAdminDashboardGate(client);
      const summary = await gate.getSummary();

      expect(summary.unavailableSections).toContain("campaign");
      expect(summary.unavailableSections).toContain("dailyTrends");
      expect(summary.campaignMaximumSongs).toBeNull();
      // Falls back to an all-zero 30-day series, not a thrown error.
      expect(summary.registrationsByDay.every((day) => day.count === 0)).toBe(true);
      // The rest of the summary is unaffected.
      expect(summary.totalLeads).toBe(1);
    });
  });
});

/**
 * Share Tracking — the dashboard's share aggregates.
 *
 * Two things are being protected here. First, that the numbers are
 * produced by the *database*: the gate issues one aggregate for the
 * totals and one for the daily split, and nothing walks rows in
 * JavaScript — share events are the one table on this screen that can
 * grow without bound. Second, that a failure in this section degrades
 * only itself, which is what `settle` exists for.
 */
describe("PrismaAdminDashboardGate — shares", () => {
  const ZERO_COUNTS = {
    totalLeads: 0,
    lyricsGenerated: 0,
    lyricsApproved: 0,
    songsRequested: 0,
    songsQueued: 0,
    songsGenerating: 0,
    songsCompleted: 0,
    songsFailed: 0,
    emailsSent: 0,
    emailsResent: 0,
    songsCompletedToday: 0,
    songsCompletedLast7Days: 0,
    songsCompletedLast30Days: 0,
  };

  /** A client whose `$queryRaw` answers the totals first, then the daily rows. */
  function clientWithShares(
    totals: { whatsapp: number; facebook: number; x: number; families: number },
    dayRows: Array<{ day: string; platform: string; count: number }>,
  ) {
    const client = fakeClient(ZERO_COUNTS);
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([totals])
      .mockResolvedValueOnce(dayRows)
      .mockResolvedValue([]);
    (client as unknown as { $queryRaw: unknown }).$queryRaw = queryRaw;
    return { client, queryRaw };
  }

  it("reports the per-platform totals and the number of families, not songs", async () => {
    const { client } = clientWithShares({ whatsapp: 7, facebook: 3, x: 2, families: 5 }, []);

    const summary = await new PrismaAdminDashboardGate(client).getSummary();

    expect(summary.shares.whatsapp).toBe(7);
    expect(summary.shares.facebook).toBe(3);
    expect(summary.shares.x).toBe(2);
    expect(summary.shares.total).toBe(12);
    // Five families produced twelve shares — the headline metric counts
    // families, because each family has exactly one song.
    expect(summary.shares.familiesShared).toBe(5);
  });

  it("splits the daily series by platform and zero-fills quiet days", async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const { client } = clientWithShares({ whatsapp: 4, facebook: 1, x: 0, families: 2 }, [
      { day: today, platform: "WHATSAPP", count: 4 },
      { day: today, platform: "FACEBOOK", count: 1 },
    ]);

    const summary = await new PrismaAdminDashboardGate(client).getSummary();
    const days = summary.shares.sharesByDay;

    // A full 30-day window, oldest first, ending today.
    expect(days.length).toBeGreaterThan(1);
    expect(days[days.length - 1].date).toBe(today);
    expect(days[days.length - 1]).toMatchObject({ whatsapp: 4, facebook: 1, x: 0 });
    // Every other day is present and explicitly zero, not missing.
    expect(days[0]).toMatchObject({ whatsapp: 0, facebook: 0, x: 0 });
  });

  it("aggregates in the database — no share rows are walked in JavaScript", async () => {
    const { client, queryRaw } = clientWithShares(
      { whatsapp: 1, facebook: 0, x: 0, families: 1 },
      [],
    );
    const shareFindMany = vi.fn();
    (client as unknown as { shareEvent: { findMany: unknown } }).shareEvent = {
      findMany: shareFindMany,
    };

    await new PrismaAdminDashboardGate(client).getSummary();

    // Two aggregates, and never a row scan.
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(shareFindMany).not.toHaveBeenCalled();
  });

  it("degrades only its own section when the share queries fail", async () => {
    const client = fakeClient(ZERO_COUNTS);
    (client as unknown as { $queryRaw: unknown }).$queryRaw = vi
      .fn()
      .mockRejectedValue(new Error("connection lost"));

    const summary = await new PrismaAdminDashboardGate(client).getSummary();

    expect(summary.unavailableSections).toContain("shares");
    expect(summary.shares).toMatchObject({ total: 0, familiesShared: 0 });
    // The rest of the dashboard still loaded.
    expect(summary.unavailableSections).not.toContain("core");
  });
});
