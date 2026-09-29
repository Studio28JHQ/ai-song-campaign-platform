import type { PrismaClient } from "@/generated/prisma/client";
import type {
  CampaignSettingsGate,
  GenerationRouting,
} from "@/application/campaign/contracts/CampaignSettingsGate";
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

  /**
   * A missing campaign row falls back to the same defaults the migration
   * writes (Mureka primary, Lyria fallback) rather than throwing: the
   * dispatcher must keep working exactly as it does today even if this
   * lookup finds nothing, and an unusable provider name would still be
   * caught downstream by `SongGenerationProviderRegistry`.
   */
  async getGenerationRouting(campaignId: string): Promise<GenerationRouting> {
    try {
      const campaign = await this.client.campaign.findUnique({
        where: { id: campaignId },
        select: { primaryProvider: true, fallbackProvider: true },
      });

      return {
        primaryProvider: campaign?.primaryProvider ?? "mureka",
        fallbackProvider: campaign?.fallbackProvider ?? null,
      };
    } catch (error) {
      throw new DatabaseError("Unexpected database error while reading generation routing.", {
        code: "campaign.unexpected_database_error",
        cause: error,
        context: { operation: "getGenerationRouting", campaignId },
      });
    }
  }

  async updateGenerationRouting(
    campaignId: string,
    routing: GenerationRouting,
  ): Promise<GenerationRouting> {
    try {
      const campaign = await this.client.campaign.update({
        where: { id: campaignId },
        data: {
          primaryProvider: routing.primaryProvider,
          fallbackProvider: routing.fallbackProvider,
        },
        select: { primaryProvider: true, fallbackProvider: true },
      });

      return {
        primaryProvider: campaign.primaryProvider,
        fallbackProvider: campaign.fallbackProvider,
      };
    } catch (error) {
      throw new DatabaseError("Unexpected database error while updating generation routing.", {
        code: "campaign.unexpected_database_error",
        cause: error,
        context: { operation: "updateGenerationRouting", campaignId },
      });
    }
  }
}
