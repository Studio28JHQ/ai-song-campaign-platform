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
 * a full repository — the same pattern as `PrismaCampaignGate`. No
 * charts, no BI — every figure here is a single, cheap aggregate count.
 */
export class PrismaAdminDashboardGate implements AdminDashboardGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async getSummary(): Promise<DashboardSummaryCounts> {
    try {
      const [
        totalLeads,
        lyricsGenerated,
        lyricsApproved,
        songsRequested,
        songsQueued,
        songsGenerating,
        songsCompleted,
        songsFailed,
        emailsSent,
        emailsResent,
      ] = await Promise.all([
        this.client.lead.count(),
        this.client.lyrics.count(),
        this.client.lyrics.count({ where: { approved: true } }),
        this.client.song.count(),
        this.client.song.count({ where: { status: PrismaSongStatus.QUEUED } }),
        this.client.song.count({ where: { status: PrismaSongStatus.GENERATING } }),
        this.client.song.count({ where: { status: PrismaSongStatus.COMPLETED } }),
        this.client.song.count({ where: { status: PrismaSongStatus.FAILED } }),
        this.client.song.count({ where: { emailedAt: { not: null } } }),
        this.client.auditLog.count({ where: { action: "resend_email" } }),
      ]);

      return {
        totalLeads,
        lyricsGenerated,
        lyricsApproved,
        songsRequested,
        songsQueued,
        songsGenerating,
        songsCompleted,
        songsFailed,
        emailsSent,
        emailsResent,
      };
    } catch (error) {
      throw new DatabaseError("Unexpected database error while loading the dashboard summary.", {
        code: "admin.unexpected_database_error",
        cause: error,
        context: { operation: "getSummary" },
      });
    }
  }
}
