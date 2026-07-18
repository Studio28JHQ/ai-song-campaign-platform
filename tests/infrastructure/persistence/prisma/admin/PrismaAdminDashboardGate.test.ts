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
      songsCompletedToday: 0,
      songsCompletedLast7Days: 0,
      songsCompletedLast30Days: 0,
      registrationsByDay: expect.any(Array),
      completedSongsByDay: expect.any(Array),
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

    expect(summary.registrationsByDay).toHaveLength(31); // inclusive of today, 30 days back
    expect(summary.registrationsByDay.at(-1)).toEqual({
      date: today.toISOString().slice(0, 10),
      count: 2,
    });
    expect(summary.completedSongsByDay).toHaveLength(31);
    expect(summary.completedSongsByDay.at(-1)).toEqual({
      date: today.toISOString().slice(0, 10),
      count: 1,
    });
  });

  it("throws a shared DatabaseError on an unexpected failure", async () => {
    const client = {
      lead: { count: vi.fn().mockRejectedValue(new Error("connection lost")), findMany: vi.fn() },
      lyrics: { count: vi.fn() },
      song: { count: vi.fn(), findMany: vi.fn() },
      auditLog: { count: vi.fn() },
      campaign: { findFirst: vi.fn() },
    } as unknown as PrismaClient;
    const gate = new PrismaAdminDashboardGate(client);

    await expect(gate.getSummary()).rejects.toThrow();
  });
});
