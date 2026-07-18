import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminRecentActivityGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminRecentActivityGate";

const LEAD = { parentName: "Jane Doe", babyName: "Baby Doe" };

function fakeClient(options: {
  leadsRegistered?: Array<{ id: string; createdAt: Date; parentName: string; babyName: string }>;
  lyricsGenerated?: Array<{ leadId: string; createdAt: Date; lead: typeof LEAD }>;
  lyricsApproved?: Array<{ leadId: string; createdAt: Date; lead: typeof LEAD }>;
  songsCompleted?: Array<{ leadId: string; completedAt: Date; lead: typeof LEAD }>;
  emailsSent?: Array<{ leadId: string; emailedAt: Date; lead: typeof LEAD }>;
  resends?: Array<{ entityId: string | null; createdAt: Date }>;
  resendSongs?: Array<{ id: string; leadId: string; lead: typeof LEAD }>;
}): PrismaClient {
  const leadFindMany = vi.fn().mockResolvedValue(options.leadsRegistered ?? []);
  const lyricsFindMany = vi
    .fn()
    .mockResolvedValueOnce(options.lyricsGenerated ?? [])
    .mockResolvedValueOnce(options.lyricsApproved ?? []);
  const songFindMany = vi
    .fn()
    .mockResolvedValueOnce(options.songsCompleted ?? [])
    .mockResolvedValueOnce(options.emailsSent ?? [])
    .mockResolvedValueOnce(options.resendSongs ?? []);
  const auditLogFindMany = vi.fn().mockResolvedValue(options.resends ?? []);

  return {
    lead: { findMany: leadFindMany },
    lyrics: { findMany: lyricsFindMany },
    song: { findMany: songFindMany },
    auditLog: { findMany: auditLogFindMany },
  } as unknown as PrismaClient;
}

describe("PrismaAdminRecentActivityGate.list", () => {
  it("returns an empty list when nothing has happened yet", async () => {
    const client = fakeClient({});
    const gate = new PrismaAdminRecentActivityGate(client);

    const result = await gate.list(15);

    expect(result).toEqual([]);
  });

  it("maps each source into its event type, newest first across all sources combined", async () => {
    const client = fakeClient({
      leadsRegistered: [{ id: "lead-1", createdAt: new Date("2026-01-01T00:00:00.000Z"), ...LEAD }],
      lyricsGenerated: [
        { leadId: "lead-1", createdAt: new Date("2026-01-02T00:00:00.000Z"), lead: LEAD },
      ],
      lyricsApproved: [
        { leadId: "lead-1", createdAt: new Date("2026-01-03T00:00:00.000Z"), lead: LEAD },
      ],
      songsCompleted: [
        { leadId: "lead-1", completedAt: new Date("2026-01-04T00:00:00.000Z"), lead: LEAD },
      ],
      emailsSent: [
        { leadId: "lead-1", emailedAt: new Date("2026-01-05T00:00:00.000Z"), lead: LEAD },
      ],
    });
    const gate = new PrismaAdminRecentActivityGate(client);

    const result = await gate.list(15);

    expect(result.map((row) => row.type)).toEqual([
      "email_sent",
      "song_completed",
      "lyrics_approved",
      "lyrics_generated",
      "lead_registered",
    ]);
    expect(result[0].parentName).toBe("Jane Doe");
    expect(result[0].babyName).toBe("Baby Doe");
  });

  it("resolves a resend_email audit entry's lead via its Song entityId, without a per-row query", async () => {
    const client = fakeClient({
      resends: [{ entityId: "song-1", createdAt: new Date("2026-01-06T00:00:00.000Z") }],
      resendSongs: [{ id: "song-1", leadId: "lead-1", lead: LEAD }],
    });
    const gate = new PrismaAdminRecentActivityGate(client);

    const result = await gate.list(15);

    expect(result).toEqual([
      {
        type: "email_resent",
        timestamp: new Date("2026-01-06T00:00:00.000Z"),
        leadId: "lead-1",
        parentName: "Jane Doe",
        babyName: "Baby Doe",
      },
    ]);
    // Exactly one follow-up batch query for resend songs — not a per-entry lookup.
    expect(client.song.findMany).toHaveBeenCalledTimes(3);
  });

  it("skips a resend_email entry whose Song can no longer be found", async () => {
    const client = fakeClient({
      resends: [{ entityId: "missing-song", createdAt: new Date("2026-01-06T00:00:00.000Z") }],
      resendSongs: [],
    });
    const gate = new PrismaAdminRecentActivityGate(client);

    const result = await gate.list(15);

    expect(result).toEqual([]);
  });

  it("truncates the merged result to the requested limit", async () => {
    const client = fakeClient({
      leadsRegistered: [
        { id: "lead-1", createdAt: new Date("2026-01-01T00:00:00.000Z"), ...LEAD },
        { id: "lead-2", createdAt: new Date("2026-01-02T00:00:00.000Z"), ...LEAD },
      ],
      lyricsGenerated: [
        { leadId: "lead-1", createdAt: new Date("2026-01-03T00:00:00.000Z"), lead: LEAD },
      ],
    });
    const gate = new PrismaAdminRecentActivityGate(client);

    const result = await gate.list(2);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("lyrics_generated");
  });

  it("throws a shared DatabaseError on an unexpected failure", async () => {
    const client = {
      lead: { findMany: vi.fn().mockRejectedValue(new Error("connection lost")) },
      lyrics: { findMany: vi.fn() },
      song: { findMany: vi.fn() },
      auditLog: { findMany: vi.fn() },
    } as unknown as PrismaClient;
    const gate = new PrismaAdminRecentActivityGate(client);

    await expect(gate.list(15)).rejects.toThrow();
  });
});
