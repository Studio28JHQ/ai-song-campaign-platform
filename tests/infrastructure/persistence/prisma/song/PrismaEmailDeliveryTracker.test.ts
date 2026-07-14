import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaEmailDeliveryTracker } from "@/infrastructure/persistence/prisma/song/PrismaEmailDeliveryTracker";

function fakeClient(updateManyResult: { count: number } | Error): PrismaClient {
  return {
    song: {
      updateMany:
        updateManyResult instanceof Error
          ? vi.fn().mockRejectedValue(updateManyResult)
          : vi.fn().mockResolvedValue(updateManyResult),
    },
  } as unknown as PrismaClient;
}

describe("PrismaEmailDeliveryTracker.claimDelivery", () => {
  it("returns true and issues a conditional update when no row has been claimed yet", async () => {
    const client = fakeClient({ count: 1 });
    const tracker = new PrismaEmailDeliveryTracker(client);

    const claimed = await tracker.claimDelivery("song-1");

    expect(claimed).toBe(true);
    expect(client.song.updateMany).toHaveBeenCalledWith({
      where: { id: "song-1", emailedAt: null },
      data: { emailedAt: expect.any(Date) },
    });
  });

  it("returns false when the row was already claimed (emailedAt already set)", async () => {
    const client = fakeClient({ count: 0 });
    const tracker = new PrismaEmailDeliveryTracker(client);

    const claimed = await tracker.claimDelivery("song-1");

    expect(claimed).toBe(false);
  });

  it("throws a shared DatabaseError on an unexpected failure", async () => {
    const client = fakeClient(new Error("connection lost"));
    const tracker = new PrismaEmailDeliveryTracker(client);

    await expect(tracker.claimDelivery("song-1")).rejects.toThrow();
  });
});
