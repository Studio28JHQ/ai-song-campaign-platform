import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminDashboardGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminDashboardGate";

function fakeClient(counts: number[]): PrismaClient {
  const count = vi.fn();
  counts.forEach((value) => count.mockResolvedValueOnce(value));

  return {
    lead: { count },
    song: { count },
  } as unknown as PrismaClient;
}

describe("PrismaAdminDashboardGate.getSummary", () => {
  it("returns the four dashboard counts", async () => {
    const client = fakeClient([10, 4, 3, 1]);
    const gate = new PrismaAdminDashboardGate(client);

    const summary = await gate.getSummary();

    expect(summary).toEqual({
      totalLeads: 10,
      songsCompleted: 4,
      songsPending: 3,
      songsFailed: 1,
    });
  });

  it("throws a shared DatabaseError on an unexpected failure", async () => {
    const client = {
      lead: { count: vi.fn().mockRejectedValue(new Error("connection lost")) },
      song: { count: vi.fn() },
    } as unknown as PrismaClient;
    const gate = new PrismaAdminDashboardGate(client);

    await expect(gate.getSummary()).rejects.toThrow();
  });
});
