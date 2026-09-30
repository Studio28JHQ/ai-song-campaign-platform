import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminShareEventGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminShareEventGate";

/**
 * Share Tracking — a family's own share history.
 *
 * The property that matters is scoping: this screen must never show one
 * family another family's activity, and the only thing preventing that
 * is the `where` clause. So the test inspects the query, not just the
 * result.
 */
function fakeClient(records: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(records);
  return { findMany, client: { shareEvent: { findMany } } as unknown as PrismaClient };
}

const EVENTS = [
  { platform: "WHATSAPP", createdAt: new Date("2026-09-30T18:42:00Z") },
  { platform: "FACEBOOK", createdAt: new Date("2026-09-29T23:10:00Z") },
];

describe("PrismaAdminShareEventGate", () => {
  it("returns the lead's events, newest first", async () => {
    const { client, findMany } = fakeClient(EVENTS);

    const result = await new PrismaAdminShareEventGate(client).findByLead("lead-1");

    expect(result).toEqual(EVENTS);
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" });
  });

  it("scopes the query to that lead, so no other family's events can appear", async () => {
    const { client, findMany } = fakeClient(EVENTS);

    await new PrismaAdminShareEventGate(client).findByLead("lead-1");

    expect(findMany.mock.calls[0][0].where).toEqual({ leadId: "lead-1" });
  });

  it("reads only the two fields the screen shows", async () => {
    const { client, findMany } = fakeClient(EVENTS);

    await new PrismaAdminShareEventGate(client).findByLead("lead-1");

    expect(findMany.mock.calls[0][0].select).toEqual({ platform: true, createdAt: true });
  });

  it("returns an empty list for a family that never shared", async () => {
    const { client } = fakeClient([]);

    expect(await new PrismaAdminShareEventGate(client).findByLead("lead-1")).toEqual([]);
  });

  it("wraps a database failure rather than leaking it", async () => {
    const client = {
      shareEvent: { findMany: vi.fn().mockRejectedValue(new Error("connection lost")) },
    } as unknown as PrismaClient;

    await expect(new PrismaAdminShareEventGate(client).findByLead("lead-1")).rejects.toThrow();
  });
});
