import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AdminSongListGate,
  AdminSongRow,
} from "@/application/admin/contracts/AdminSongListGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";
import { toPublicSongStatus } from "./adminLeadFilters";

/**
 * Thin Prisma adapter satisfying the `AdminSongListGate` port — the
 * most recent songs, newest first, joined with their Lead for display.
 * No search/filter/pagination (not asked for on this list, unlike
 * "Familias") — just a capped, ordered read, the same simplicity
 * `PrismaAdminDashboardGate` already favors over building more
 * machinery than the screen needs.
 */
export class PrismaAdminSongListGate implements AdminSongListGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async list(limit: number): Promise<AdminSongRow[]> {
    try {
      const records = await this.client.song.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { lead: { select: { parentName: true, babyName: true } } },
      });

      return records.map((record) => ({
        id: record.id,
        leadId: record.leadId,
        createdAt: record.createdAt,
        parentName: record.lead.parentName,
        babyName: record.lead.babyName,
        status: toPublicSongStatus(record.status),
        provider: record.provider,
        audioStorageKey: record.audioStorageKey,
        emailedAt: record.emailedAt,
      }));
    } catch (error) {
      throw new DatabaseError("Unexpected database error while listing songs.", {
        code: "admin.unexpected_database_error",
        cause: error,
        context: { operation: "list" },
      });
    }
  }
}
