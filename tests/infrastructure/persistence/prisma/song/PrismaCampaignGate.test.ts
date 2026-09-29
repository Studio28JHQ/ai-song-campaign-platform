import { describe, expect, it, vi } from "vitest";
import { CampaignStatus, type PrismaClient, SongStatus } from "@/generated/prisma/client";
import { PrismaCampaignGate } from "@/infrastructure/persistence/prisma/song/PrismaCampaignGate";

/**
 * Sprint FINAL-6 — Derived Campaign Capacity.
 *
 * The cap means "how many finished songs the campaign is holding", and
 * these tests hold that meaning in place. It used to be read from
 * `campaigns.songsGenerated`, a stored tally that only ever goes up: by
 * 2026-09-29 it read 430 against 395 stored songs, so the campaign would
 * have stopped 35 songs early on a number that counted songs nobody
 * could listen to any more. Capacity is now counted from `songs`, which
 * cannot drift and which gives a slot back when a song is deleted.
 */
function fakeClient(
  campaign: {
    status: CampaignStatus;
    isGenerationEnabled: boolean;
    maximumSongs: number;
    songsGenerated?: number;
  } | null,
  completedSongs = 0,
) {
  const findUnique = vi.fn().mockResolvedValue(campaign);
  const update = vi.fn().mockResolvedValue(campaign);
  const count = vi.fn().mockResolvedValue(completedSongs);

  return {
    findUnique,
    update,
    count,
    client: {
      campaign: { findUnique, update },
      song: { count },
    } as unknown as PrismaClient,
  };
}

const ACTIVE = {
  status: CampaignStatus.ACTIVE,
  isGenerationEnabled: true,
  maximumSongs: 3000,
};

describe("PrismaCampaignGate.isActiveAndGenerationEnabled", () => {
  it("[A] counts the stored completed songs, and has capacity while under the cap", async () => {
    const { client, count } = fakeClient(ACTIVE, 395);
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(true);
    expect(count).toHaveBeenCalledWith({ where: { status: SongStatus.COMPLETED } });
    // 395 stored against a 3000 cap: 2605 slots left.
  });

  it.each([
    [2998, true],
    [2999, true],
    [3000, false],
    [3001, false],
  ])("[B][C][F][G] %s stored songs → capacity %s", async (stored, expected) => {
    // The same test covers filling the last slot and freeing one again:
    // capacity is a pure function of how many songs are stored, so
    // completing one and deleting one are the same movement in reverse.
    const { client } = fakeClient(ACTIVE, stored);
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(expected);
  });

  it("[D] a family with no song changes nothing, because nothing about the count changed", async () => {
    const { client, count } = fakeClient(ACTIVE, 395);
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(true);
    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(true);
    expect(count).toHaveBeenCalledTimes(2);
  });

  it("[E] ignores the campaign's historical songsGenerated entirely", async () => {
    // The exact production situation on 2026-09-29: the tally said 430,
    // the shelf held 395. Only the shelf decides.
    const { client, findUnique } = fakeClient({ ...ACTIVE, songsGenerated: 430 }, 395);
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(true);
    // The field is not even read.
    expect(findUnique.mock.calls[0][0].select).toEqual({
      status: true,
      isGenerationEnabled: true,
      maximumSongs: true,
    });
  });

  it("[E] a historical tally already past the cap does not block generation", async () => {
    const { client } = fakeClient({ ...ACTIVE, songsGenerated: 3500 }, 10);
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(true);
  });

  it.each([
    ["[H] FAILED", SongStatus.FAILED],
    ["[I] QUEUED", SongStatus.QUEUED],
    ["[I] GENERATING", SongStatus.GENERATING],
  ])("%s songs are not counted against the cap", async (_label, status) => {
    const { client, count } = fakeClient(ACTIVE, 0);
    const gate = new PrismaCampaignGate(client);

    await gate.isActiveAndGenerationEnabled("campaign-1");

    // Only COMPLETED is ever asked for, so an unfinished or failed song
    // cannot occupy a slot it never filled.
    const where = count.mock.calls[0][0].where;
    expect(where).toEqual({ status: SongStatus.COMPLETED });
    expect(where.status).not.toBe(status);
  });

  it("returns false when the campaign is not ACTIVE, without bothering to count", async () => {
    const { client, count } = fakeClient({ ...ACTIVE, status: CampaignStatus.PAUSED }, 0);
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(false);
    expect(count).not.toHaveBeenCalled();
  });

  it("returns false when generation is disabled, without bothering to count", async () => {
    const { client, count } = fakeClient({ ...ACTIVE, isGenerationEnabled: false }, 0);
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("campaign-1")).toBe(false);
    expect(count).not.toHaveBeenCalled();
  });

  it("returns false when the campaign does not exist", async () => {
    const { client } = fakeClient(null);
    const gate = new PrismaCampaignGate(client);

    expect(await gate.isActiveAndGenerationEnabled("missing")).toBe(false);
  });

  it("throws a shared DatabaseError when the campaign lookup fails", async () => {
    const client = {
      campaign: { findUnique: vi.fn().mockRejectedValue(new Error("connection lost")) },
    } as unknown as PrismaClient;
    const gate = new PrismaCampaignGate(client);

    await expect(gate.isActiveAndGenerationEnabled("campaign-1")).rejects.toThrow();
  });

  it("throws a shared DatabaseError when the count fails, rather than assuming capacity", async () => {
    const client = {
      campaign: { findUnique: vi.fn().mockResolvedValue(ACTIVE) },
      song: { count: vi.fn().mockRejectedValue(new Error("connection lost")) },
    } as unknown as PrismaClient;
    const gate = new PrismaCampaignGate(client);

    await expect(gate.isActiveAndGenerationEnabled("campaign-1")).rejects.toThrow();
  });
});

describe("PrismaCampaignGate.incrementSongsGenerated", () => {
  // Unchanged: the tally keeps recording how many songs ever completed.
  // It is simply no longer what the cap or the panel reads.
  it("atomically increments the campaign's historical songsGenerated counter", async () => {
    const { client, update } = fakeClient({ ...ACTIVE, songsGenerated: 41 });
    const gate = new PrismaCampaignGate(client);

    await gate.incrementSongsGenerated("campaign-1");

    expect(update).toHaveBeenCalledWith({
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
