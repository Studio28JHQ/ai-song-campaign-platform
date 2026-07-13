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
        select: { status: true, isGenerationEnabled: true },
      });

      return campaign?.status === CampaignStatus.ACTIVE && campaign.isGenerationEnabled === true;
    } catch (error) {
      throw new DatabaseError("Unexpected database error while checking campaign status.", {
        code: "song.unexpected_database_error",
        cause: error,
        context: { operation: "isActiveAndGenerationEnabled", campaignId },
      });
    }
  }
}
