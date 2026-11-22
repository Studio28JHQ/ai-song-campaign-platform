import { SongStatus as PrismaSongStatus, type PrismaClient } from "@/generated/prisma/client";
import type {
  PipelineHealthGate,
  PipelineHealthSnapshot,
} from "@/application/alerting/contracts/PipelineHealthGate";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Operational Alerting. Thin, single-purpose Prisma adapter for
 * `PipelineHealthGate` — the same shape as `PrismaCampaignGate` and
 * `PrismaAdminDashboardGate`, not a repository.
 *
 * Three cheap aggregates, no row scan: a count, a `MIN(createdAt)` over
 * the same filter (both served by the status index), and the newest
 * `completedAt`. This runs on every scheduled pipeline tick, so it must
 * stay something the database answers from an index rather than work that
 * grows with the campaign.
 *
 * Errors are not caught here. The caller is the pipeline tick, whose own
 * `catch` already turns any failure into the `SONG_PIPELINE_TICK_FAILED`
 * alert — swallowing it here would mean a broken health check reports the
 * pipeline as healthy, which is the one outcome a monitor must never
 * produce.
 */
export class PrismaPipelineHealthGate implements PipelineHealthGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async getPipelineHealth(): Promise<PipelineHealthSnapshot> {
    const pendingStatuses = [PrismaSongStatus.QUEUED, PrismaSongStatus.GENERATING];

    const [pending, lastCompleted] = await Promise.all([
      this.client.song.aggregate({
        where: { status: { in: pendingStatuses } },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
      this.client.song.aggregate({
        where: { status: PrismaSongStatus.COMPLETED },
        _max: { completedAt: true },
      }),
    ]);

    return {
      pendingCount: pending._count._all,
      oldestPendingAt: pending._min.createdAt ?? null,
      lastCompletedAt: lastCompleted._max.completedAt ?? null,
    };
  }
}
