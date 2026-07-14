import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminLeadExportGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLeadExportGate";

const now = new Date("2026-01-01T00:00:00.000Z");

function buildRecord(overrides: Record<string, unknown> = {}) {
  return {
    parentName: "Jane Doe",
    babyName: "Baby Doe",
    email: "jane@example.com",
    phone: "+1 555 123 4567",
    createdAt: now,
    lyrics: [{ approved: true }],
    song: { status: "READY", generatedAt: now, emailedAt: now },
    ...overrides,
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of iterable) results.push(item);
  return results;
}

describe("PrismaAdminLeadExportGate.streamRows", () => {
  it("maps a record with an approved lyrics version and a completed, emailed song", async () => {
    const findMany = vi.fn().mockResolvedValueOnce([buildRecord()]).mockResolvedValueOnce([]);
    const client = { lead: { findMany } } as unknown as PrismaClient;
    const gate = new PrismaAdminLeadExportGate(client);

    const batches = await collect(gate.streamRows({}, 500));

    expect(batches).toHaveLength(1);
    expect(batches[0][0]).toEqual({
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      email: "jane@example.com",
      phone: "+1 555 123 4567",
      createdAt: now,
      lyricsStatus: "APPROVED",
      songStatus: "COMPLETED",
      emailStatus: "SENT",
      generatedAt: now,
      emailedAt: now,
    });
  });

  it("reports lyricsStatus NONE when no lyrics exist, and GENERATED when none are approved", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        buildRecord({ lyrics: [], song: null }),
        buildRecord({ lyrics: [{ approved: false }], song: null }),
      ])
      .mockResolvedValueOnce([]);
    const client = { lead: { findMany } } as unknown as PrismaClient;
    const gate = new PrismaAdminLeadExportGate(client);

    const batches = await collect(gate.streamRows({}, 500));

    expect(batches[0][0].lyricsStatus).toBe("NONE");
    expect(batches[0][0].songStatus).toBeNull();
    expect(batches[0][0].emailStatus).toBe("NOT_SENT");
    expect(batches[0][1].lyricsStatus).toBe("GENERATED");
  });

  it("streams multiple batches without ever requesting the full dataset in one call", async () => {
    const firstBatch = Array.from({ length: 3 }, () => buildRecord());
    const secondBatch = Array.from({ length: 2 }, () => buildRecord());
    const findMany = vi
      .fn()
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(secondBatch)
      .mockResolvedValueOnce([]);
    const client = { lead: { findMany } } as unknown as PrismaClient;
    const gate = new PrismaAdminLeadExportGate(client);

    const batches = await collect(gate.streamRows({}, 3));

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(3);
    expect(batches[1]).toHaveLength(2);
    // Every call requested only `batchSize` rows at a time — never the whole table.
    for (const call of findMany.mock.calls) {
      expect(call[0].take).toBe(3);
    }
  });

  it("stops as soon as a batch comes back smaller than batchSize, without an extra trailing call", async () => {
    const batch = Array.from({ length: 2 }, () => buildRecord());
    const findMany = vi.fn().mockResolvedValueOnce(batch);
    const client = { lead: { findMany } } as unknown as PrismaClient;
    const gate = new PrismaAdminLeadExportGate(client);

    const batches = await collect(gate.streamRows({}, 5));

    expect(batches).toHaveLength(1);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("throws a shared DatabaseError on an unexpected failure", async () => {
    const findMany = vi.fn().mockRejectedValue(new Error("connection lost"));
    const client = { lead: { findMany } } as unknown as PrismaClient;
    const gate = new PrismaAdminLeadExportGate(client);

    await expect(collect(gate.streamRows({}, 500))).rejects.toThrow();
  });
});
