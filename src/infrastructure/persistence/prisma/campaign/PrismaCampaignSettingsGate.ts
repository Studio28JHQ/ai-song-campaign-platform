import type { PrismaClient } from "@/generated/prisma/client";
import type { CampaignSettingsGate } from "@/application/campaign/contracts/CampaignSettingsGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Thin, single-purpose Prisma adapter satisfying the `CampaignSettingsGate`
 * port — mirrors `PrismaCampaignGate` (`src/infrastructure/persistence/prisma/song/`).
 * There is no Campaign domain module (see `docs/Architecture/Domain_Model.md`),
 * so this is a narrow adapter over two queries, not a full repository.
 */
export class PrismaCampaignSettingsGate implements CampaignSettingsGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async getGtmContainerId(campaignId: string): Promise<string | null> {
    try {
      const campaign = await this.client.campaign.findUnique({
        where: { id: campaignId },
        select: { gtmContainerId: true },
      });

      return campaign?.gtmContainerId ?? null;
    } catch (error) {
      throw new DatabaseError("Unexpected database error while reading campaign settings.", {
        code: "campaign.unexpected_database_error",
        cause: error,
        context: { operation: "getGtmContainerId", campaignId },
      });
    }
  }

  async updateGtmContainerId(
    campaignId: string,
    gtmContainerId: string | null,
  ): Promise<string | null> {
    try {
      const campaign = await this.client.campaign.update({
        where: { id: campaignId },
        data: { gtmContainerId },
        select: { gtmContainerId: true },
      });

      return campaign.gtmContainerId;
    } catch (error) {
      throw new DatabaseError("Unexpected database error while updating campaign settings.", {
        code: "campaign.unexpected_database_error",
        cause: error,
        context: { operation: "updateGtmContainerId", campaignId },
      });
    }
  }
}
