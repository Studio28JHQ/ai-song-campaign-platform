import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminDashboardGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminDashboardGate";

function fakeClient(counts: {
  totalLeads: number;
  lyricsGenerated: number;
  lyricsApproved: number;
  songsRequested: number;
  songsCompleted: number;
  songsFailed: number;
  emailsSent: number;
  emailsResent: number;
}): PrismaClient {
  const leadCount = vi.fn().mockResolvedValue(counts.totalLeads);
  const lyricsCount = vi
    .fn()
    .mockResolvedValueOnce(counts.lyricsGenerated)
    .mockResolvedValueOnce(counts.lyricsApproved);
  const songCount = vi
    .fn()
    .mockResolvedValueOnce(counts.songsRequested)
    .mockResolvedValueOnce(counts.songsCompleted)
    .mockResolvedValueOnce(counts.songsFailed)
    .mockResolvedValueOnce(counts.emailsSent);
  const auditLogCount = vi.fn().mockResolvedValue(counts.emailsResent);

  return {
    lead: { count: leadCount },
    lyrics: { count: lyricsCount },
    song: { count: songCount },
    auditLog: { count: auditLogCount },
  } as unknown as PrismaClient;
}

describe("PrismaAdminDashboardGate.getSummary", () => {
  it("returns the nine dashboard indicators as plain counts", async () => {
    const client = fakeClient({
      totalLeads: 10,
      lyricsGenerated: 12,
      lyricsApproved: 8,
      songsRequested: 7,
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
      songsCompleted: 4,
      songsFailed: 2,
      emailsSent: 4,
      emailsResent: 1,
    });
  });

  it("counts resent emails via AuditLog entries with action resend_email", async () => {
    const client = fakeClient({
      totalLeads: 1,
      lyricsGenerated: 1,
      lyricsApproved: 1,
      songsRequested: 1,
      songsCompleted: 1,
      songsFailed: 0,
      emailsSent: 1,
      emailsResent: 3,
    });
    const gate = new PrismaAdminDashboardGate(client);

    await gate.getSummary();

    expect(client.auditLog.count).toHaveBeenCalledWith({ where: { action: "resend_email" } });
  });

  it("throws a shared DatabaseError on an unexpected failure", async () => {
    const client = {
      lead: { count: vi.fn().mockRejectedValue(new Error("connection lost")) },
      lyrics: { count: vi.fn() },
      song: { count: vi.fn() },
      auditLog: { count: vi.fn() },
    } as unknown as PrismaClient;
    const gate = new PrismaAdminDashboardGate(client);

    await expect(gate.getSummary()).rejects.toThrow();
  });
});
