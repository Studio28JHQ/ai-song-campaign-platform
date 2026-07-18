import { SongStatus as PrismaSongStatus, type PrismaClient } from "@/generated/prisma/client";
import type {
  AdminDashboardGate,
  DailyCount,
  DashboardSummaryCounts,
} from "@/application/admin/contracts/AdminDashboardGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Thin, single-purpose Prisma adapter satisfying the `AdminDashboardGate`
 * port. There is no reporting/analytics domain module (out of scope —
 * see PROJECT_MANIFEST.md), so this is a handful of `count`/`findMany`
 * queries, not a full repository — the same pattern as `PrismaCampaignGate`.
 * No BI engine, no raw SQL aggregation — every figure here is either a
 * single cheap aggregate or an in-memory bucketing over a bounded,
 * already-windowed row set (this campaign is capped at a few thousand
 * leads/songs total — see PROJECT_MANIFEST.md).
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
        campaign,
        songsCompletedToday,
        songsCompletedLast7Days,
        songsCompletedLast30Days,
        recentLeadTimestamps,
        recentCompletedSongTimestamps,
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
        this.client.campaign.findFirst({
          orderBy: { createdAt: "asc" },
          select: { maximumSongs: true, songsGenerated: true },
        }),
        this.client.song.count({
          where: { status: PrismaSongStatus.COMPLETED, completedAt: { gte: startOfToday } },
        }),
        this.client.song.count({
          where: { status: PrismaSongStatus.COMPLETED, completedAt: { gte: sevenDaysAgo } },
        }),
        this.client.song.count({
          where: { status: PrismaSongStatus.COMPLETED, completedAt: { gte: thirtyDaysAgo } },
        }),
        this.client.lead.findMany({
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { createdAt: true },
        }),
        this.client.song.findMany({
          where: { status: PrismaSongStatus.COMPLETED, completedAt: { gte: thirtyDaysAgo } },
          select: { completedAt: true },
        }),
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
        campaignMaximumSongs: campaign?.maximumSongs ?? null,
        campaignSongsGenerated: campaign?.songsGenerated ?? null,
        songsCompletedToday,
        songsCompletedLast7Days,
        songsCompletedLast30Days,
        registrationsByDay: this.bucketByDay(
          recentLeadTimestamps.map((row) => row.createdAt),
          thirtyDaysAgo,
        ),
        completedSongsByDay: this.bucketByDay(
          recentCompletedSongTimestamps.map((row) => row.completedAt!),
          thirtyDaysAgo,
        ),
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

  /**
   * Sprint FINAL-2 — Campaign Operations Dashboard. Buckets already-
   * fetched timestamps into one count per calendar day from `since`
   * through today (inclusive), zero-filling days with no events — a
   * `Map` preserves insertion order, so the result comes out oldest
   * first with no separate sort needed. Day boundaries and the `date`
   * key are both computed in UTC (not local time) so the bucketing is
   * self-consistent regardless of the server's timezone.
   */
  private bucketByDay(timestamps: Date[], since: Date): DailyCount[] {
    const toUtcDateKey = (date: Date): string => date.toISOString().slice(0, 10);
    const startOfDayUtc = (date: Date): Date =>
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

    const startOfSince = startOfDayUtc(since);
    const startOfToday = startOfDayUtc(new Date());

    const counts = new Map<string, number>();
    for (
      const cursor = new Date(startOfSince);
      cursor <= startOfToday;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      counts.set(toUtcDateKey(cursor), 0);
    }

    for (const timestamp of timestamps) {
      const key = toUtcDateKey(timestamp);
      if (counts.has(key)) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return [...counts.entries()].map(([date, count]) => ({ date, count }));
  }
}
