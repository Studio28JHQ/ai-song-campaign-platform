import { SongStatus as PrismaSongStatus, type PrismaClient } from "@/generated/prisma/client";
import type {
  AdminDashboardGate,
  DailyCount,
  DashboardSection,
  DashboardSummaryCounts,
} from "@/application/admin/contracts/AdminDashboardGate";
import { logger } from "@/shared/logger/logger";
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
 *
 * Sprint FINAL-3 — Dashboard Stabilization. Root cause of "Unexpected
 * database error while loading the dashboard summary": every query this
 * method needs used to run inside one `Promise.all`, wrapped by a single
 * try/catch — a transient failure in any one of them (a connection
 * hiccup, pool contention under concurrent admin traffic, a lock — and
 * this list has only grown, sprint over sprint) rejected the whole
 * batch and took the entire Dashboard down with one generic message,
 * even though the other queries had already succeeded. Worse, the
 * route handler logged only `error.message` (the generic wrapper text)
 * and never `error.cause`, so the real failure was invisible even in
 * server logs — effectively suppressed.
 *
 * Fixed by isolating every query behind `settle()`: each one is caught
 * independently, its real error is always logged in full (never
 * suppressed), and a safe fallback lets the rest of the summary — and
 * therefore the rest of the Dashboard — keep rendering normally. Which
 * sections (if any) actually failed is reported via
 * `unavailableSections` so the UI can show a small, localized error on
 * just the affected widget instead of blanking the whole page.
 */
export class PrismaAdminDashboardGate implements AdminDashboardGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async getSummary(): Promise<DashboardSummaryCounts> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const failedSections = new Set<DashboardSection>();

    const settle = async <T>(
      section: DashboardSection,
      label: string,
      fallback: T,
      run: () => Promise<T>,
    ): Promise<T> => {
      try {
        return await run();
      } catch (error) {
        failedSections.add(section);
        logger.error("Dashboard widget query failed — using a safe fallback for this section", {
          section,
          query: label,
          error: error instanceof Error ? error.message : String(error),
          cause:
            error instanceof Error && error.cause instanceof Error
              ? error.cause.message
              : undefined,
        });
        return fallback;
      }
    };

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
      settle("core", "lead.count", 0, () => this.client.lead.count()),
      settle("core", "lyrics.count", 0, () => this.client.lyrics.count()),
      settle("core", "lyrics.count(approved)", 0, () =>
        this.client.lyrics.count({ where: { approved: true } }),
      ),
      settle("core", "song.count", 0, () => this.client.song.count()),
      settle("core", "song.count(QUEUED)", 0, () =>
        this.client.song.count({ where: { status: PrismaSongStatus.QUEUED } }),
      ),
      settle("core", "song.count(GENERATING)", 0, () =>
        this.client.song.count({ where: { status: PrismaSongStatus.GENERATING } }),
      ),
      settle("core", "song.count(COMPLETED)", 0, () =>
        this.client.song.count({ where: { status: PrismaSongStatus.COMPLETED } }),
      ),
      settle("core", "song.count(FAILED)", 0, () =>
        this.client.song.count({ where: { status: PrismaSongStatus.FAILED } }),
      ),
      settle("core", "song.count(emailed)", 0, () =>
        this.client.song.count({ where: { emailedAt: { not: null } } }),
      ),
      settle("core", "auditLog.count(resend_email)", 0, () =>
        this.client.auditLog.count({ where: { action: "resend_email" } }),
      ),
      settle("generationTime", "avgGenerationMinutes(today)", null, () =>
        this.averageGenerationMinutesSince(startOfToday),
      ),
      settle("generationTime", "avgGenerationMinutes(7d)", null, () =>
        this.averageGenerationMinutesSince(sevenDaysAgo),
      ),
      settle("generationTime", "avgGenerationMinutes(30d)", null, () =>
        this.averageGenerationMinutesSince(thirtyDaysAgo),
      ),
      settle(
        "campaign",
        "campaign.findFirst",
        null as { maximumSongs: number; songsGenerated: number } | null,
        () =>
          this.client.campaign.findFirst({
            orderBy: { createdAt: "asc" },
            select: { maximumSongs: true, songsGenerated: true },
          }),
      ),
      settle("windowCounts", "song.count(completedToday)", 0, () =>
        this.client.song.count({
          where: { status: PrismaSongStatus.COMPLETED, completedAt: { gte: startOfToday } },
        }),
      ),
      settle("windowCounts", "song.count(completed7d)", 0, () =>
        this.client.song.count({
          where: { status: PrismaSongStatus.COMPLETED, completedAt: { gte: sevenDaysAgo } },
        }),
      ),
      settle("windowCounts", "song.count(completed30d)", 0, () =>
        this.client.song.count({
          where: { status: PrismaSongStatus.COMPLETED, completedAt: { gte: thirtyDaysAgo } },
        }),
      ),
      settle("dailyTrends", "lead.findMany(recent)", [] as Array<{ createdAt: Date }>, () =>
        this.client.lead.findMany({
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { createdAt: true },
        }),
      ),
      settle(
        "dailyTrends",
        "song.findMany(recentCompleted)",
        [] as Array<{ completedAt: Date | null }>,
        () =>
          this.client.song.findMany({
            where: { status: PrismaSongStatus.COMPLETED, completedAt: { gte: thirtyDaysAgo } },
            select: { completedAt: true },
          }),
      ),
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
        recentCompletedSongTimestamps
          .map((row) => row.completedAt)
          .filter((date): date is Date => date !== null),
        thirtyDaysAgo,
      ),
      unavailableSections: [...failedSections],
    };
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
