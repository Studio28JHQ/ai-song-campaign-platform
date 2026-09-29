import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminLeadSearchGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLeadSearchGate";

/**
 * Sprint FINAL-5 — Test Data Cleanup. The Families list is ordered and
 * paged by the database, not by the page the browser happens to hold.
 *
 * The bug this guards against is subtle: when the sorted column ties —
 * and `createdAt` ties constantly, since nearly two hundred families
 * registered in one day — PostgreSQL makes no promise about the order of
 * the tied rows, and that order can differ between two queries. Page 2
 * can then repeat a row from page 1, or skip one entirely. Appending the
 * unique id makes the order total, which makes paging stable.
 */
function fakeClient(records: unknown[] = [], total = 0) {
  const findMany = vi.fn().mockResolvedValue(records);
  const count = vi.fn().mockResolvedValue(total);
  return { findMany, count, client: { lead: { findMany, count } } as unknown as PrismaClient };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    createdAt: new Date("2026-09-29T16:47:32.000Z"),
    parentName: "Jane Doe",
    babyName: "Baby Doe",
    email: "jane@example.com",
    phone: null,
    song: null,
    ...overrides,
  };
}

describe("PrismaAdminLeadSearchGate ordering", () => {
  it("[1] defaults to newest first, by the stored timestamp", async () => {
    const { client, findMany } = fakeClient();

    await new PrismaAdminLeadSearchGate(client).search({ page: 1, pageSize: 20 } as never);

    const [args] = findMany.mock.calls[0];
    expect(args.orderBy[0]).toEqual({ createdAt: "desc" });
  });

  it("[1] orders by the real column, never by a formatted string", async () => {
    const { client, findMany } = fakeClient();

    await new PrismaAdminLeadSearchGate(client).search({ page: 1, pageSize: 20 } as never);

    const serialised = JSON.stringify(findMany.mock.calls[0][0].orderBy);
    expect(serialised).toContain("createdAt");
    // Nothing display-shaped can have leaked into the sort.
    expect(serialised).not.toContain("/");
    expect(serialised).not.toContain("formatted");
  });

  it("[2] breaks ties deterministically, so families registered in the same second keep a stable order", async () => {
    const { client, findMany } = fakeClient();

    await new PrismaAdminLeadSearchGate(client).search({ page: 1, pageSize: 20 } as never);

    const orderBy = findMany.mock.calls[0][0].orderBy;
    expect(Array.isArray(orderBy)).toBe(true);
    expect(orderBy).toHaveLength(2);
    expect(orderBy[1]).toEqual({ id: "desc" });
  });

  it.each([
    ["parentName", { parentName: "asc" }],
    ["babyName", { babyName: "asc" }],
    ["email", { email: "asc" }],
    ["songStatus", { song: { status: "asc" } }],
  ])("[2] appends the same tiebreaker when sorting by %s", async (sortBy, expected) => {
    const { client, findMany } = fakeClient();

    await new PrismaAdminLeadSearchGate(client).search({
      page: 1,
      pageSize: 20,
      sortBy,
      sortDirection: "asc",
    } as never);

    const orderBy = findMany.mock.calls[0][0].orderBy;
    expect(orderBy[0]).toEqual(expected);
    expect(orderBy[1]).toEqual({ id: "asc" });
  });

  it("[3] pages in the database, applying the same order to every page", async () => {
    const { client, findMany } = fakeClient([row()], 120);

    await new PrismaAdminLeadSearchGate(client).search({ page: 3, pageSize: 20 } as never);

    const [args] = findMany.mock.calls[0];
    expect(args.skip).toBe(40);
    expect(args.take).toBe(20);
    expect(args.orderBy[0]).toEqual({ createdAt: "desc" });
    expect(args.orderBy[1]).toEqual({ id: "desc" });
  });

  it("[3][10] counts the same filtered set it lists, so the total and the pages agree", async () => {
    const { client, findMany, count } = fakeClient([row()], 57);

    const result = await new PrismaAdminLeadSearchGate(client).search({
      page: 2,
      pageSize: 20,
      city: "Quito",
    } as never);

    // Identical `where` on both sides: the total describes the filtered
    // set, not the table, and it is what the page count is derived from.
    expect(count.mock.calls[0][0].where).toEqual(findMany.mock.calls[0][0].where);
    expect(result.total).toBe(57);
  });

  it("returns the stored timestamp untouched, leaving formatting to the view", async () => {
    const createdAt = new Date("2026-09-29T16:47:32.000Z");
    const { client } = fakeClient([row({ createdAt })], 1);

    const result = await new PrismaAdminLeadSearchGate(client).search({
      page: 1,
      pageSize: 20,
    } as never);

    expect(result.items[0].createdAt).toBe(createdAt);
    expect(result.items[0].createdAt.getUTCSeconds()).toBe(32);
  });
});
