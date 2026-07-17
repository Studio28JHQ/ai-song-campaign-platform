import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminDashboardGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminDashboardGate";

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
  completedSongs?: Array<{ submittedAt: Date; completedAt: Date }>;
  campaign?: { maximumSongs: number; songsGenerated: number } | null;
}): PrismaClient {
  const leadCount = vi.fn().mockResolvedValue(counts.totalLeads);
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
    .mockResolvedValueOnce(counts.emailsSent);
  const auditLogCount = vi.fn().mockResolvedValue(counts.emailsResent);
  const songFindMany = vi.fn().mockResolvedValue(counts.completedSongs ?? []);
  const campaignFindFirst = vi.fn().mockResolvedValue(counts.campaign ?? null);

  return {
    lead: { count: leadCount },
    lyrics: { count: lyricsCount },
    song: { count: songCount, findMany: songFindMany },
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
      averageGenerationMinutes: { today: null, last7Days: null, last30Days: null },
      campaignMaximumSongs: null,
      campaignSongsGenerated: null,
    });
  });

  it("returns the campaign's real maximumSongs and songsGenerated when a campaign row exists", async () => {
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
    expect(summary.campaignSongsGenerated).toBe(42);
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

  it("averages submittedAt-to-completedAt minutes over completed songs in the window", async () => {
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
      completedSongs: [
        {
          submittedAt: new Date("2026-01-01T00:00:00.000Z"),
          completedAt: new Date("2026-01-01T00:05:00.000Z"),
        },
        {
          submittedAt: new Date("2026-01-01T00:00:00.000Z"),
          completedAt: new Date("2026-01-01T00:07:00.000Z"),
        },
      ],
    });
    const gate = new PrismaAdminDashboardGate(client);

    const summary = await gate.getSummary();

    expect(summary.averageGenerationMinutes.today).toBe(6);
    expect(summary.averageGenerationMinutes.last7Days).toBe(6);
    expect(summary.averageGenerationMinutes.last30Days).toBe(6);
  });

  it("throws a shared DatabaseError on an unexpected failure", async () => {
    const client = {
      lead: { count: vi.fn().mockRejectedValue(new Error("connection lost")) },
      lyrics: { count: vi.fn() },
      song: { count: vi.fn(), findMany: vi.fn() },
      auditLog: { count: vi.fn() },
      campaign: { findFirst: vi.fn() },
    } as unknown as PrismaClient;
    const gate = new PrismaAdminDashboardGate(client);

    await expect(gate.getSummary()).rejects.toThrow();
  });
});
