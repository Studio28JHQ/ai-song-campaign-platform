import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type {
  AdminLyricsListFilter,
  AdminLyricsListGate,
  AdminLyricsListResult,
} from "@/application/admin/contracts/AdminLyricsListGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Thin Prisma adapter satisfying the `AdminLyricsListGate` port — a
 * paginated, searched (parent/baby name) join across Lyrics, Lead, and
 * Mood, newest first.
 *
 * Sprint FINAL-1 — Production Hardening: replaced the earlier
 * capped-at-200, unfiltered read (fine below 200 lyrics versions, not
 * once the campaign passes that volume).
 */
export class PrismaAdminLyricsListGate implements AdminLyricsListGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async list(filter: AdminLyricsListFilter): Promise<AdminLyricsListResult> {
    try {
      const where = this.buildWhere(filter);

      const [records, total] = await Promise.all([
        this.client.lyrics.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
          include: {
            lead: { select: { parentName: true, babyName: true } },
            mood: { select: { name: true } },
          },
        }),
        this.client.lyrics.count({ where }),
      ]);

      const items = records.map((record) => ({
        id: record.id,
        leadId: record.leadId,
        createdAt: record.createdAt,
        parentName: record.lead.parentName,
        babyName: record.lead.babyName,
        moodName: record.mood.name,
        version: record.version,
        approved: record.approved,
        rejectionReason: record.rejectionReason,
      }));

      return { items, total };
    } catch (error) {
      throw new DatabaseError("Unexpected database error while listing lyrics.", {
        code: "admin.unexpected_database_error",
        cause: error,
        context: { operation: "list" },
      });
    }
  }

  private buildWhere(filter: AdminLyricsListFilter): Prisma.LyricsWhereInput {
    if (!filter.query) {
      return {};
    }

    return {
      lead: {
        OR: [
          { parentName: { contains: filter.query, mode: "insensitive" } },
          { babyName: { contains: filter.query, mode: "insensitive" } },
        ],
      },
    };
  }
}
