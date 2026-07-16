import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AdminLyricsListGate,
  AdminLyricsRow,
} from "@/application/admin/contracts/AdminLyricsListGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Thin Prisma adapter satisfying the `AdminLyricsListGate` port — the
 * most recent lyrics versions, newest first, joined with their Lead
 * and Mood for display. No search/filter/pagination, the same
 * simplicity `PrismaAdminSongListGate` favors.
 */
export class PrismaAdminLyricsListGate implements AdminLyricsListGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async list(limit: number): Promise<AdminLyricsRow[]> {
    try {
      const records = await this.client.lyrics.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          lead: { select: { parentName: true, babyName: true } },
          mood: { select: { name: true } },
        },
      });

      return records.map((record) => ({
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
    } catch (error) {
      throw new DatabaseError("Unexpected database error while listing lyrics.", {
        code: "admin.unexpected_database_error",
        cause: error,
        context: { operation: "list" },
      });
    }
  }
}
