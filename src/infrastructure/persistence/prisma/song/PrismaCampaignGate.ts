import { CampaignStatus, type PrismaClient, SongStatus } from "@/generated/prisma/client";
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
        },
      });

      if (!campaign) {
        return false;
      }

      if (campaign.status !== CampaignStatus.ACTIVE || campaign.isGenerationEnabled !== true) {
        return false;
      }

      // Counted, not read from `campaigns.songsGenerated`.
      //
      // The cap means "how many finished songs the campaign is holding",
      // and that is a property of the `songs` table, not of a number kept
      // alongside it. Keeping a copy in sync required two code paths to
      // agree forever, and they stopped agreeing: on 2026-09-29 the
      // counter read 430 against 395 stored songs, because it is only
      // ever incremented and deleting a family never gave the slot back.
      // A campaign would have stopped 35 songs early on a number that
      // described songs nobody could listen to any more.
      //
      // Counting cannot drift, because there is nothing to keep in sync.
      // It costs an index-only scan of `songs_status_idx` once per
      // authorisation — measured at cost 22 against ~400 rows — and it
      // makes deleting a song give its slot back for free.
      const completedSongs = await this.client.song.count({
        where: { status: SongStatus.COMPLETED },
      });

      return completedSongs < campaign.maximumSongs;
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
