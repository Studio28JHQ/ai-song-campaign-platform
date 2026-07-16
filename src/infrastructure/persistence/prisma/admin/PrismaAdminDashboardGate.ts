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
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

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
        today,
        last7Days,
        last30Days,
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
        this.averageGenerationMinutesSince(startOfToday),
        this.averageGenerationMinutesSince(sevenDaysAgo),
        this.averageGenerationMinutesSince(thirtyDaysAgo),
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
        averageGenerationMinutes: { today, last7Days, last30Days },
      };
    } catch (error) {
      throw new DatabaseError("Unexpected database error while loading the dashboard summary.", {
        code: "admin.unexpected_database_error",
        cause: error,
        context: { operation: "getSummary" },
      });
    }
  }

  /**
   * Sprint ADMIN-1 — Backoffice de Campaña. Average minutes between
   * `submittedAt` and `completedAt` over `COMPLETED` songs finished
   * since `since` — `null` (never a throw) when none have completed in
   * that window yet, per the brief's "Do not fail" requirement. A plain
   * in-memory average over a handful of rows, not a raw SQL aggregate —
   * this campaign is capped at a few thousand songs total (see
   * PROJECT_MANIFEST.md), so this stays cheap without extra query
   * complexity.
   */
  private async averageGenerationMinutesSince(since: Date): Promise<number | null> {
    const songs = await this.client.song.findMany({
      where: {
        status: PrismaSongStatus.COMPLETED,
        completedAt: { gte: since },
        submittedAt: { not: null },
      },
      select: { submittedAt: true, completedAt: true },
    });

    if (songs.length === 0) return null;

    const totalMinutes = songs.reduce((sum, song) => {
      const minutes = (song.completedAt!.getTime() - song.submittedAt!.getTime()) / 60_000;
      return sum + minutes;
    }, 0);

    return Math.round((totalMinutes / songs.length) * 10) / 10;
  }
}
