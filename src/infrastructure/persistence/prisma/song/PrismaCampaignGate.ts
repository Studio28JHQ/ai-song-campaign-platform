import { CampaignStatus, type PrismaClient } from "@/generated/prisma/client";
import type { CampaignGate } from "@/application/song/contracts/CampaignGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Thin, single-purpose Prisma lookup satisfying the `CampaignGate` port.
 * There is no Campaign domain module (out of scope for this task), so
 * this is a narrow adapter over one query — not a full repository.
 */
export class PrismaCampaignGate implements CampaignGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async isActiveAndGenerationEnabled(campaignId: string): Promise<boolean> {
    try {
      const campaign = await this.client.campaign.findUnique({
        where: { id: campaignId },
        select: {
          status: true,
          isGenerationEnabled: true,
          maximumSongs: true,
          songsGenerated: true,
        },
      });

      if (!campaign) {
        return false;
      }

      return (
        campaign.status === CampaignStatus.ACTIVE &&
        campaign.isGenerationEnabled === true &&
        campaign.songsGenerated < campaign.maximumSongs
      );
    } catch (error) {
      throw new DatabaseError("Unexpected database error while checking campaign status.", {
        code: "song.unexpected_database_error",
        cause: error,
        context: { operation: "isActiveAndGenerationEnabled", campaignId },
      });
    }
  }

  async incrementSongsGenerated(campaignId: string): Promise<void> {
    try {
      await this.client.campaign.update({
        where: { id: campaignId },
        data: { songsGenerated: { increment: 1 } },
      });
    } catch (error) {
      throw new DatabaseError("Unexpected database error while incrementing songsGenerated.", {
        code: "song.unexpected_database_error",
        cause: error,
        context: { operation: "incrementSongsGenerated", campaignId },
      });
    }
  }
}
