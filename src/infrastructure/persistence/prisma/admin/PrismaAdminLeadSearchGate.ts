import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type {
  AdminLeadRow,
  AdminLeadSearchFilter,
  AdminLeadSearchGate,
  AdminLeadSearchResult,
} from "@/application/admin/contracts/AdminLeadSearchGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";
import { buildAdminLeadWhere, toPublicSongStatus } from "./adminLeadFilters";

/**
 * Thin Prisma adapter satisfying the `AdminLeadSearchGate` port: a
 * paginated, sortable, `ILIKE`-searched, filterable join across Lead and
 * Song. No existing repository supports this shape (see the port's own
 * documentation), so this lives directly against Prisma rather than
 * being bolted onto `LeadRepository`. Shares its `WHERE`-clause
 * construction with `PrismaAdminLeadExportGate` (see
 * `adminLeadFilters.ts`) so search and export always agree on what a
 * given filter combination matches.
 */
export class PrismaAdminLeadSearchGate implements AdminLeadSearchGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async search(filter: AdminLeadSearchFilter): Promise<AdminLeadSearchResult> {
    try {
      const where = buildAdminLeadWhere(filter);
      const orderBy = this.toOrderBy(filter.sortBy, filter.sortDirection);

      const [records, total] = await Promise.all([
        this.client.lead.findMany({
          where,
          orderBy,
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
          include: { song: { select: { status: true, emailedAt: true } } },
        }),
        this.client.lead.count({ where }),
      ]);

      const items: AdminLeadRow[] = records.map((record) => ({
        id: record.id,
        createdAt: record.createdAt,
        parentName: record.parentName,
        babyName: record.babyName,
        email: record.email,
        phone: record.phone,
        songStatus: record.song ? toPublicSongStatus(record.song.status) : null,
        emailSent: record.song?.emailedAt != null,
      }));

      return { items, total };
    } catch (error) {
      throw new DatabaseError("Unexpected database error while searching leads.", {
        code: "admin.unexpected_database_error",
        cause: error,
        context: { operation: "search" },
      });
    }
  }

  private toOrderBy(
    sortBy: string | undefined,
    sortDirection: "asc" | "desc" | undefined,
  ): Prisma.LeadOrderByWithRelationInput {
    const direction = sortDirection ?? "desc";

    switch (sortBy) {
      case "parentName":
        return { parentName: direction };
      case "babyName":
        return { babyName: direction };
      case "email":
        return { email: direction };
      case "songStatus":
        return { song: { status: direction } };
      default:
        return { createdAt: direction };
    }
  }
}
