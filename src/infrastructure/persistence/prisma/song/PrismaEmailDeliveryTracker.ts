import type { PrismaClient } from "@/generated/prisma/client";
import type { EmailDeliveryTracker } from "@/application/song/contracts/EmailDeliveryTracker";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Claims email delivery via a single conditional `UPDATE ... WHERE
 * "emailedAt" IS NULL`, backed directly by the already-persisted
 * `emailedAt` column on the `Song` record (see `prisma/schema.prisma`) —
 * the same narrow-adapter-over-one-query pattern as
 * `PrismaCampaignGate`/`PrismaMoodSunoPromptProvider`, since there is no
 * dedicated EmailDelivery domain module.
 *
 * The conditional `WHERE` makes the claim atomic at the database level:
 * even if the background job ran twice concurrently for the same song,
 * only one call can ever see `count === 1` and be told to send.
 */
export class PrismaEmailDeliveryTracker implements EmailDeliveryTracker {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async claimDelivery(songId: string): Promise<boolean> {
    try {
      const result = await this.client.song.updateMany({
        where: { id: songId, emailedAt: null },
        data: { emailedAt: new Date() },
      });

      return result.count === 1;
    } catch (error) {
      throw new DatabaseError("Unexpected database error while claiming email delivery.", {
        code: "song.unexpected_database_error",
        cause: error,
        context: { operation: "claimDelivery", songId },
      });
    }
  }
}
