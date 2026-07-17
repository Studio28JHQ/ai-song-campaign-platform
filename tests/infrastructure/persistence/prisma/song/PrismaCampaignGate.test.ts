import { describe, expect, it, vi } from "vitest";
import { CampaignStatus, type PrismaClient } from "@/generated/prisma/client";
import { PrismaCampaignGate } from "@/infrastructure/persistence/prisma/song/PrismaCampaignGate";

function fakeClient(
  campaign: {
    status: CampaignStatus;
    isGenerationEnabled: boolean;
    maximumSongs: number;
    songsGenerated: number;
  } | null,
): PrismaClient {
  return {
    campaign: {
      findUnique: vi.fn().mockResolvedValue(campaign),
      update: vi.fn().mockResolvedValue(campaign),
    },
  } as unknown as PrismaClient;
}

describe("PrismaCampaignGate.isActiveAndGenerationEnabled", () => {
  it("returns true when active, enabled, and under the songs budget", async () => {
    const client = fakeClient({
      status: CampaignStatus.ACTIVE,
      isGenerationEnabled: true,
      maximumSongs: 3000,
      songsGenerated: 2999,
    });
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(true);
  });

  it("returns false once songsGenerated has reached maximumSongs (RC-final — campaign budget)", async () => {
    const client = fakeClient({
      status: CampaignStatus.ACTIVE,
      isGenerationEnabled: true,
      maximumSongs: 3000,
      songsGenerated: 3000,
    });
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(false);
  });

  it("returns false when songsGenerated has exceeded maximumSongs", async () => {
    const client = fakeClient({
      status: CampaignStatus.ACTIVE,
      isGenerationEnabled: true,
      maximumSongs: 3000,
      songsGenerated: 3001,
    });
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(false);
  });

  it("returns false when the campaign is not ACTIVE, even under budget", async () => {
    const client = fakeClient({
      status: CampaignStatus.PAUSED,
      isGenerationEnabled: true,
      maximumSongs: 3000,
      songsGenerated: 0,
    });
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(false);
  });

  it("returns false when generation is disabled, even under budget", async () => {
    const client = fakeClient({
      status: CampaignStatus.ACTIVE,
      isGenerationEnabled: false,
      maximumSongs: 3000,
      songsGenerated: 0,
    });
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(false);
  });

  it("returns false when the campaign does not exist", async () => {
    const client = fakeClient(null);
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("missing")).toBe(false);
  });

  it("throws a shared DatabaseError on an unexpected failure", async () => {
    const client = {
      campaign: { findUnique: vi.fn().mockRejectedValue(new Error("connection lost")) },
    } as unknown as PrismaClient;
    const gate = new PrismaCampaignGate(client);

    await expect(gate.isActiveAndGenerationEnabled("campaign-1")).rejects.toThrow();
  });
});

describe("PrismaCampaignGate.incrementSongsGenerated", () => {
  it("atomically increments the campaign's songsGenerated counter", async () => {
    const client = fakeClient({
      status: CampaignStatus.ACTIVE,
      isGenerationEnabled: true,
      maximumSongs: 3000,
      songsGenerated: 41,
    });
    const gate = new PrismaCampaignGate(client);

    await gate.incrementSongsGenerated("campaign-1");

    expect(client.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign-1" },
      data: { songsGenerated: { increment: 1 } },
    });
  });

  it("throws a shared DatabaseError on an unexpected failure", async () => {
    const client = {
      campaign: { update: vi.fn().mockRejectedValue(new Error("connection lost")) },
    } as unknown as PrismaClient;
    const gate = new PrismaCampaignGate(client);

    await expect(gate.incrementSongsGenerated("campaign-1")).rejects.toThrow();
  });
});
