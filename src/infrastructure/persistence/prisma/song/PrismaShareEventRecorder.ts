import type {
  ShareEventRecord,
  ShareEventRecorder,
} from "@/application/song/contracts/ShareEventRecorder";
import type { PrismaClient } from "@/generated/prisma/client";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Share Tracking — writes one `share_events` row per recorded click.
 *
 * A single insert with no transaction: there is nothing to keep
 * consistent with it, and the caller redirects whether or not this
 * succeeds, so wrapping it would add a connection round trip for no
 * guarantee. Uses the shared client (see `../client`) — the pool is
 * capped at five connections per process and this must not add its own.
 */
export class PrismaShareEventRecorder implements ShareEventRecorder {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async record(event: ShareEventRecord): Promise<void> {
    try {
      await this.client.shareEvent.create({
        data: {
          songId: event.songId,
          leadId: event.leadId,
          platform: event.platform,
          utmSource: event.utmSource,
          utmMedium: event.utmMedium,
          utmCampaign: event.utmCampaign,
        },
        select: { id: true },
      });
    } catch (cause) {
      throw new DatabaseError("Failed to record a share event.", {
        code: "share_event.record_failed",
        cause,
        // No token and no ids the URL did not already carry — this
        // message can reach a log aggregator.
        context: { platform: event.platform },
      });
    }
  }
}
