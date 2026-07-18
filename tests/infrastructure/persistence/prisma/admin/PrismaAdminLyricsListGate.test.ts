import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminLyricsListGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLyricsListGate";

const now = new Date("2026-01-01T00:00:00.000Z");

function fakeClient(records: unknown[], total: number): PrismaClient {
  return {
    lyrics: {
      findMany: vi.fn().mockResolvedValue(records),
      count: vi.fn().mockResolvedValue(total),
    },
  } as unknown as PrismaClient;
}

function fakeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "lyrics-1",
    leadId: "lead-1",
    createdAt: now,
    version: 1,
    approved: true,
    rejectionReason: null,
    lead: { parentName: "Jane Doe", babyName: "Baby Doe" },
    mood: { name: "Joyful" },
    ...overrides,
  };
}

describe("PrismaAdminLyricsListGate.list", () => {
  it("returns an empty page when there are no lyrics versions yet", async () => {
    const client = fakeClient([], 0);
    const gate = new PrismaAdminLyricsListGate(client);

    const result = await gate.list({ page: 1, pageSize: 20 });

    expect(result).toEqual({ items: [], total: 0 });
  });

  it("maps a single record to a row", async () => {
    const client = fakeClient([fakeRecord()], 1);
    const gate = new PrismaAdminLyricsListGate(client);

    const result = await gate.list({ page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual({
      id: "lyrics-1",
      leadId: "lead-1",
      createdAt: now,
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      moodName: "Joyful",
      version: 1,
      approved: true,
      rejectionReason: null,
    });
  });

  it("maps multiple records, preserving order", async () => {
    const client = fakeClient(
      [fakeRecord({ id: "lyrics-2", version: 2 }), fakeRecord({ id: "lyrics-1", version: 1 })],
      2,
    );
    const gate = new PrismaAdminLyricsListGate(client);

    const result = await gate.list({ page: 1, pageSize: 20 });

    expect(result.items.map((item) => item.id)).toEqual(["lyrics-2", "lyrics-1"]);
  });

  it("maps a rejected version's non-null rejectionReason", async () => {
    const client = fakeClient(
      [fakeRecord({ approved: false, rejectionReason: "Contains offensive language." })],
      1,
    );
    const gate = new PrismaAdminLyricsListGate(client);

    const result = await gate.list({ page: 1, pageSize: 20 });

    expect(result.items[0].approved).toBe(false);
    expect(result.items[0].rejectionReason).toBe("Contains offensive language.");
  });

  it("applies pagination via skip/take", async () => {
    const client = fakeClient([], 0);
    const gate = new PrismaAdminLyricsListGate(client);

    await gate.list({ page: 3, pageSize: 10 });

    expect(client.lyrics.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it("orders by createdAt descending", async () => {
    const client = fakeClient([], 0);
    const gate = new PrismaAdminLyricsListGate(client);

    await gate.list({ page: 1, pageSize: 20 });

    expect(client.lyrics.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("builds a case-insensitive OR filter across parent name and baby name when searching", async () => {
    const client = fakeClient([], 0);
    const gate = new PrismaAdminLyricsListGate(client);

    await gate.list({ query: "jane", page: 1, pageSize: 20 });

    const call = (client.lyrics.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toEqual({
      lead: {
        OR: [
          { parentName: { contains: "jane", mode: "insensitive" } },
          { babyName: { contains: "jane", mode: "insensitive" } },
        ],
      },
    });
  });

  it("applies no filter when there is no search query", async () => {
    const client = fakeClient([], 0);
    const gate = new PrismaAdminLyricsListGate(client);

    await gate.list({ page: 1, pageSize: 20 });

    expect(client.lyrics.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  // Regression guard for the bug this test file was added to cover: an
  // `include` (rather than an explicit `select`) implicitly requests
  // every scalar column ever added to the Lyrics model, including ones
  // from a migration not yet applied to a given database — see
  // CHANGELOG. `select` must always list exactly the columns this
  // read model actually maps, and no more.
  it("selects only the columns this read model actually maps, not every Lyrics column", async () => {
    const client = fakeClient([], 0);
    const gate = new PrismaAdminLyricsListGate(client);

    await gate.list({ page: 1, pageSize: 20 });

    const call = (client.lyrics.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.select).toEqual({
      id: true,
      leadId: true,
      createdAt: true,
      version: true,
      approved: true,
      rejectionReason: true,
      lead: { select: { parentName: true, babyName: true } },
      mood: { select: { name: true } },
    });
    expect(call.include).toBeUndefined();
  });

  it("throws a shared DatabaseError on an unexpected failure, without swallowing the original cause", async () => {
    const originalError = new Error("column lyrics.musicMood does not exist");
    const client = {
      lyrics: {
        findMany: vi.fn().mockRejectedValue(originalError),
        count: vi.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaClient;
    const gate = new PrismaAdminLyricsListGate(client);

    await expect(gate.list({ page: 1, pageSize: 20 })).rejects.toThrow();

    try {
      await gate.list({ page: 1, pageSize: 20 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).cause).toBe(originalError);
    }
  });
});
