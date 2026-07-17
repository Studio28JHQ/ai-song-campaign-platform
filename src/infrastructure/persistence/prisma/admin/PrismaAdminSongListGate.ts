import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type {
  AdminSongListFilter,
  AdminSongListGate,
  AdminSongListResult,
} from "@/application/admin/contracts/AdminSongListGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";
import { toPrismaSongStatuses, toPublicSongStatus } from "./adminLeadFilters";

/**
 * Thin Prisma adapter satisfying the `AdminSongListGate` port — a
 * paginated, searched (parent/baby name), status-filtered join across
 * Song and Lead, newest first.
 *
 * Sprint FINAL-1 — Production Hardening: replaced the earlier
 * capped-at-200, unfiltered read (fine below a few hundred rows, not at
 * 3,000) — reuses `toPrismaSongStatuses`/`toPublicSongStatus`, the same
 * status-vocabulary translation `PrismaAdminLeadSearchGate` already
 * relies on, so both screens agree on what a given status filter means.
 */
export class PrismaAdminSongListGate implements AdminSongListGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async list(filter: AdminSongListFilter): Promise<AdminSongListResult> {
    try {
      const where = this.buildWhere(filter);

      const [records, total] = await Promise.all([
        this.client.song.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
          include: { lead: { select: { parentName: true, babyName: true } } },
        }),
        this.client.song.count({ where }),
      ]);

      const items = records.map((record) => ({
        id: record.id,
        leadId: record.leadId,
        createdAt: record.createdAt,
        parentName: record.lead.parentName,
        babyName: record.lead.babyName,
        status: toPublicSongStatus(record.status),
        provider: record.provider,
        audioStorageKey: record.audioStorageKey,
        providerError: record.providerError,
        emailedAt: record.emailedAt,
      }));

      return { items, total };
    } catch (error) {
      throw new DatabaseError("Unexpected database error while listing songs.", {
        code: "admin.unexpected_database_error",
        cause: error,
        context: { operation: "list" },
      });
    }
  }

  private buildWhere(filter: AdminSongListFilter): Prisma.SongWhereInput {
    const clauses: Prisma.SongWhereInput[] = [];

    if (filter.query) {
      clauses.push({
        lead: {
          OR: [
            { parentName: { contains: filter.query, mode: "insensitive" } },
            { babyName: { contains: filter.query, mode: "insensitive" } },
          ],
        },
      });
    }

    if (filter.status) {
      clauses.push({ status: { in: toPrismaSongStatuses(filter.status) } });
    }

    return clauses.length > 0 ? { AND: clauses } : {};
  }
}
