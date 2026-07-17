import { Prisma, SongStatus as PrismaSongStatus } from "@/generated/prisma/client";
import type {
  AdminLeadFilterCriteria,
  AdminLeadSongStatusFilter,
} from "@/application/admin/contracts/AdminLeadFilterCriteria";

/**
 * Translates the persistence-layer `SongStatus` into the same public
 * vocabulary (`QUEUED`/`GENERATING`/`COMPLETED`/`FAILED`) the parent-facing
 * `GET /api/song/{songId}` endpoint uses (see `app/api/song/publicSongStatus.ts`),
 * so the admin table and export read consistently with the rest of the
 * app. Kept as a local mapping rather than importing from `app/` — that
 * would invert Clean Architecture's dependency direction (infrastructure
 * must never depend on presentation).
 */
export function toPublicSongStatus(status: PrismaSongStatus): string {
  return status === PrismaSongStatus.DELIVERED ? "COMPLETED" : status;
}

export function toPrismaSongStatuses(
  filter: Exclude<AdminLeadSongStatusFilter, "NONE">,
): PrismaSongStatus[] {
  switch (filter) {
    case "COMPLETED":
      return [PrismaSongStatus.COMPLETED, PrismaSongStatus.DELIVERED];
    case "QUEUED":
      return [PrismaSongStatus.QUEUED];
    case "GENERATING":
      return [PrismaSongStatus.GENERATING];
    case "FAILED":
      return [PrismaSongStatus.FAILED];
  }
}

/**
 * Builds the `Lead` `WHERE` clause shared by `PrismaAdminLeadSearchGate`
 * and `PrismaAdminLeadExportGate` — search and export must always agree
 * on what a given filter combination matches (see
 * docs/Product/User_Flow.md — Filters), so this is the one place that
 * translation happens.
 */
export function buildAdminLeadWhere(filter: AdminLeadFilterCriteria): Prisma.LeadWhereInput {
  const clauses: Prisma.LeadWhereInput[] = [];

  if (filter.query) {
    clauses.push({
      OR: [
        { parentName: { contains: filter.query, mode: "insensitive" } },
        { babyName: { contains: filter.query, mode: "insensitive" } },
        { email: { contains: filter.query, mode: "insensitive" } },
        { phone: { contains: filter.query, mode: "insensitive" } },
      ],
    });
  }

  if (filter.dateFrom || filter.dateTo) {
    clauses.push({
      createdAt: {
        ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
        ...(filter.dateTo ? { lte: filter.dateTo } : {}),
      },
    });
  }

  if (filter.city) {
    clauses.push({ city: { contains: filter.city, mode: "insensitive" } });
  }

  if (filter.songStatus === "NONE") {
    clauses.push({ song: null });
  } else if (filter.songStatus) {
    clauses.push({ song: { status: { in: toPrismaSongStatuses(filter.songStatus) } } });
  }

  if (filter.emailStatus === "SENT") {
    clauses.push({ song: { emailedAt: { not: null } } });
  } else if (filter.emailStatus === "NOT_SENT") {
    clauses.push({ OR: [{ song: null }, { song: { emailedAt: null } }] });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}
