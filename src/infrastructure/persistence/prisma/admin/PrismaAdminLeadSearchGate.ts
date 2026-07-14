import {
  Prisma,
  SongStatus as PrismaSongStatus,
  type PrismaClient,
} from "@/generated/prisma/client";
import type {
  AdminLeadRow,
  AdminLeadSearchFilter,
  AdminLeadSearchGate,
  AdminLeadSearchResult,
} from "@/application/admin/contracts/AdminLeadSearchGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Translates the persistence-layer `SongStatus` into the same public
 * vocabulary (`PENDING`/`GENERATING`/`COMPLETED`/`FAILED`) the parent-facing
 * `GET /api/song/{songId}` endpoint uses (see `app/api/song/publicSongStatus.ts`),
 * so the admin table reads consistently with the rest of the app. Kept as
 * a local one-line mapping rather than importing from `app/` — that would
 * invert Clean Architecture's dependency direction (infrastructure must
 * never depend on presentation).
 */
function toPublicSongStatus(status: PrismaSongStatus): string {
  return status === PrismaSongStatus.READY || status === PrismaSongStatus.DELIVERED
    ? "COMPLETED"
    : status;
}

/**
 * Thin Prisma adapter satisfying the `AdminLeadSearchGate` port: a
 * paginated, sortable, `ILIKE`-searched join across Lead and Song. No
 * existing repository supports this shape (see the port's own
 * documentation), so this lives directly against Prisma rather than
 * being bolted onto `LeadRepository`.
 */
export class PrismaAdminLeadSearchGate implements AdminLeadSearchGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async search(filter: AdminLeadSearchFilter): Promise<AdminLeadSearchResult> {
    try {
      const where = this.toWhere(filter.query);
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

  private toWhere(query: string | undefined): Prisma.LeadWhereInput {
    if (!query) return {};

    return {
      OR: [
        { parentName: { contains: query, mode: "insensitive" } },
        { babyName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ],
    };
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
