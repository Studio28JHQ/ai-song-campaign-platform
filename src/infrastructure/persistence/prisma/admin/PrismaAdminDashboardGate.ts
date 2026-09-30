import { SongStatus as PrismaSongStatus, type PrismaClient } from "@/generated/prisma/client";
import type {
  AdminDashboardGate,
  DailyCount,
  DailySharePlatformCount,
  DashboardSection,
  DashboardSummaryCounts,
  ShareCounts,
} from "@/application/admin/contracts/AdminDashboardGate";
import { logger } from "@/shared/logger/logger";
import { prisma as defaultPrismaClient } from "../client";

/**
 * The campaign's timezone, and the one the whole Dashboard means when it
 * says "a day". Ecuador has no daylight saving, but this goes through
 * `Intl` rather than subtracting five hours so the rule stays true if
 * that ever changes.
 *
 * `en-CA` is used purely because it formats as `YYYY-MM-DD`, which sorts
 * lexicographically — that is what lets the zero-filling loop below walk
 * days by comparing strings.
 */
const CAMPAIGN_TIME_ZONE = "America/Guayaquil";

/** The window every daily trend on this screen covers. */
const DAILY_TREND_DAYS = 30;

/** One `(day, platform)` bucket, already aggregated by the database. */
interface SharesByDayRow {
  day: string;
  platform: string;
  count: number;
}

/** All-time share totals, aggregated in one row by the database. */
interface ShareTotalsRow {
  whatsapp: number;
  facebook: number;
  x: number;
  families: number;
}

const EMPTY_SHARE_TOTALS: ShareTotalsRow = { whatsapp: 0, facebook: 0, x: 0, families: 0 };

const campaignDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAMPAIGN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Which campaign day an instant falls on, as `YYYY-MM-DD`. */
function toCampaignDayKey(at: Date): string {
  return campaignDayFormatter.format(at);
}

/**
 * The day after `dayKey`. Anchored at noon UTC on purpose: it is far
 * enough from either midnight that adding 24 hours can never land back
 * on the same campaign day or skip one, whatever the offset.
 */
function nextCampaignDay(dayKey: string): string {
  const noon = new Date(`${dayKey}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + 1);
  return toCampaignDayKey(noon);
}

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
      campaign,
      songsCompletedToday,
      songsCompletedLast7Days,
      songsCompletedLast30Days,
      recentLeadTimestamps,
      recentCompletedSongTimestamps,
      shareTotals,
      shareDayRows,
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
      settle("campaign", "campaign.findFirst", null as { maximumSongs: number } | null, () =>
        this.client.campaign.findFirst({
          orderBy: { createdAt: "asc" },
          select: { maximumSongs: true },
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
      // Share Tracking. Three aggregates, never a row scan: share events
      // are the one table here that can grow without bound, so the
      // per-platform totals come back as three rows, the family count as
      // one, and the chart as at most thirty. Nothing is grouped in
      // JavaScript, and all three ride the same `Promise.all` as
      // everything else — the pool is capped at five connections.
      settle(
        "shares",
        "shareEvent.totals",
        [EMPTY_SHARE_TOTALS],
        () =>
          this.client.$queryRaw<ShareTotalsRow[]>`
          SELECT
            COUNT(*) FILTER (WHERE platform = 'WHATSAPP')::int AS whatsapp,
            COUNT(*) FILTER (WHERE platform = 'FACEBOOK')::int AS facebook,
            COUNT(*) FILTER (WHERE platform = 'X')::int        AS x,
            COUNT(DISTINCT "leadId")::int                      AS families
          FROM "share_events"
        `,
      ),
      settle(
        "shares",
        "shareEvent.byDay",
        [] as SharesByDayRow[],
        () =>
          this.client.$queryRaw<SharesByDayRow[]>`
          SELECT
            to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${CAMPAIGN_TIME_ZONE})::date,
                    'YYYY-MM-DD') AS day,
            platform::text AS platform,
            COUNT(*)::int AS count
          FROM "share_events"
          WHERE "createdAt" >= ${thirtyDaysAgo}
          GROUP BY 1, 2
        `,
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
      campaignMaximumSongs: campaign?.maximumSongs ?? null,
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
      shares: this.buildShareCounts(shareTotals, shareDayRows, thirtyDaysAgo),
      unavailableSections: [...failedSections],
    };
  }

  /**
   * Share Tracking. Folds the three aggregates into the shape the
   * Dashboard renders. The only arithmetic here is over at most ~33
   * already-aggregated rows — the grouping itself happened in the
   * database.
   */
  private buildShareCounts(
    totals: ShareTotalsRow[],
    dayRows: SharesByDayRow[],
    since: Date,
  ): ShareCounts {
    const { whatsapp, facebook, x, families } = totals[0] ?? EMPTY_SHARE_TOTALS;

    // Zero-filled the same way the other daily trends are, so a quiet
    // day is a visible zero rather than a missing bar.
    const byDay = new Map<string, DailySharePlatformCount>();
    const today = toCampaignDayKey(new Date());
    let day = toCampaignDayKey(since);
    for (let guard = 0; guard <= DAILY_TREND_DAYS; guard += 1) {
      byDay.set(day, { date: day, whatsapp: 0, facebook: 0, x: 0 });
      if (day === today) break;
      day = nextCampaignDay(day);
    }

    for (const row of dayRows) {
      const bucket = byDay.get(row.day);
      if (!bucket) continue;
      if (row.platform === "WHATSAPP") bucket.whatsapp += row.count;
      else if (row.platform === "FACEBOOK") bucket.facebook += row.count;
      else if (row.platform === "X") bucket.x += row.count;
    }

    return {
      total: whatsapp + facebook + x,
      whatsapp,
      facebook,
      x,
      familiesShared: families,
      sharesByDay: [...byDay.values()],
    };
  }

  /**
   * Sprint FINAL-2 — Campaign Operations Dashboard. Buckets already-
   * fetched timestamps into one count per calendar day from `since`
   * through today (inclusive), zero-filling days with no events — a
   * `Map` preserves insertion order, so the result comes out oldest
   * first with no separate sort needed.
   *
   * Days are the campaign's own days, not UTC ones (Sprint FINAL-7 —
   * Dashboard Charts). It used to bucket in UTC, which put a family that
   * registered at 00:30 UTC into a bar the operator would read as the
   * next day — while the Familias table, which renders the same
   * timestamp in `America/Guayaquil`, showed it as the previous evening.
   * The same event appeared on two different days in two places on the
   * same screen. Both now mean the campaign's day.
   *
   * The `date` key each `DailyCount` carries is therefore already a local
   * day, which is why the chart renders it verbatim instead of
   * converting again.
   */
  private bucketByDay(timestamps: Date[], since: Date): DailyCount[] {
    const startOfSince = toCampaignDayKey(since);
    const today = toCampaignDayKey(new Date());

    const counts = new Map<string, number>();
    for (let day = startOfSince; day <= today; day = nextCampaignDay(day)) {
      counts.set(day, 0);
    }

    for (const timestamp of timestamps) {
      const key = toCampaignDayKey(timestamp);
      if (counts.has(key)) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return [...counts.entries()].map(([date, count]) => ({ date, count }));
  }
}
