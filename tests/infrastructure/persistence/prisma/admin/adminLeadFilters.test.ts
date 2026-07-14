import { describe, expect, it } from "vitest";
import {
  buildAdminLeadWhere,
  toPublicSongStatus,
} from "@/infrastructure/persistence/prisma/admin/adminLeadFilters";

describe("buildAdminLeadWhere", () => {
  it("returns an empty object when no filters are given", () => {
    expect(buildAdminLeadWhere({})).toEqual({});
  });

  it("filters by an inclusive date range on createdAt", () => {
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");
    const dateTo = new Date("2026-01-31T23:59:59.000Z");

    const where = buildAdminLeadWhere({ dateFrom, dateTo });

    expect(where).toEqual({ AND: [{ createdAt: { gte: dateFrom, lte: dateTo } }] });
  });

  it("filters by dateFrom alone", () => {
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");
    const where = buildAdminLeadWhere({ dateFrom });
    expect(where).toEqual({ AND: [{ createdAt: { gte: dateFrom } }] });
  });

  it("filters by city, case-insensitively", () => {
    const where = buildAdminLeadWhere({ city: "Austin" });
    expect(where).toEqual({ AND: [{ city: { contains: "Austin", mode: "insensitive" } }] });
  });

  it("maps songStatus COMPLETED to both COMPLETED and DELIVERED", () => {
    const where = buildAdminLeadWhere({ songStatus: "COMPLETED" }) as {
      AND: Array<{ song?: { status?: { in: string[] } } }>;
    };
    expect(where.AND[0].song?.status?.in).toEqual(["COMPLETED", "DELIVERED"]);
  });

  it("maps songStatus NONE to leads with no song at all", () => {
    const where = buildAdminLeadWhere({ songStatus: "NONE" });
    expect(where).toEqual({ AND: [{ song: null }] });
  });

  it("maps emailStatus SENT to a non-null emailedAt", () => {
    const where = buildAdminLeadWhere({ emailStatus: "SENT" });
    expect(where).toEqual({ AND: [{ song: { emailedAt: { not: null } } }] });
  });

  it("maps emailStatus NOT_SENT to leads with no song or an unsent song", () => {
    const where = buildAdminLeadWhere({ emailStatus: "NOT_SENT" });
    expect(where).toEqual({ AND: [{ OR: [{ song: null }, { song: { emailedAt: null } }] }] });
  });

  it("combines the free-text query with every other filter via AND", () => {
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");
    const where = buildAdminLeadWhere({
      query: "jane",
      dateFrom,
      city: "Austin",
      songStatus: "FAILED",
      emailStatus: "NOT_SENT",
    }) as { AND: unknown[] };

    // Query + dateFrom + city + songStatus + emailStatus = 5 independent clauses, ANDed together.
    expect(where.AND).toHaveLength(5);
  });
});

describe("toPublicSongStatus", () => {
  it("maps DELIVERED to COMPLETED", () => {
    expect(toPublicSongStatus("DELIVERED" as never)).toBe("COMPLETED");
  });

  it("passes QUEUED, GENERATING, COMPLETED, and FAILED through unchanged", () => {
    expect(toPublicSongStatus("QUEUED" as never)).toBe("QUEUED");
    expect(toPublicSongStatus("GENERATING" as never)).toBe("GENERATING");
    expect(toPublicSongStatus("COMPLETED" as never)).toBe("COMPLETED");
    expect(toPublicSongStatus("FAILED" as never)).toBe("FAILED");
  });
});
