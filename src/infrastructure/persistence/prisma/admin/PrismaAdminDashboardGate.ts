import { SongStatus as PrismaSongStatus, type PrismaClient } from "@/generated/prisma/client";
import type {
  AdminDashboardGate,
  DashboardSummaryCounts,
} from "@/application/admin/contracts/AdminDashboardGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Thin, single-purpose Prisma adapter satisfying the `AdminDashboardGate`
 * port. There is no reporting/analytics domain module (out of scope —
 * see PROJECT_MANIFEST.md), so this is a handful of `count` queries, not
 * a full repository — the same pattern as `PrismaCampaignGate`.
 *
 * "Pending" groups `PENDING` and `GENERATING` into one figure — the
 * dashboard shows four cards (Total Leads, Songs Completed, Songs
 * Pending, Songs Failed), not a fifth "generating" card.
 */
export class PrismaAdminDashboardGate implements AdminDashboardGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async getSummary(): Promise<DashboardSummaryCounts> {
    try {
      const [totalLeads, songsCompleted, songsPending, songsFailed] = await Promise.all([
        this.client.lead.count(),
        this.client.song.count({ where: { status: PrismaSongStatus.READY } }),
        this.client.song.count({
          where: { status: { in: [PrismaSongStatus.PENDING, PrismaSongStatus.GENERATING] } },
        }),
        this.client.song.count({ where: { status: PrismaSongStatus.FAILED } }),
      ]);

      return { totalLeads, songsCompleted, songsPending, songsFailed };
    } catch (error) {
      throw new DatabaseError("Unexpected database error while loading the dashboard summary.", {
        code: "admin.unexpected_database_error",
        cause: error,
        context: { operation: "getSummary" },
      });
    }
  }
}
