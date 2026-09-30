import { describe, expect, it, vi } from "vitest";
import { type PrismaClient, SongStatus } from "@/generated/prisma/client";
import { PrismaPublicSongShareGate } from "@/infrastructure/persistence/prisma/song/PrismaPublicSongShareGate";

/**
 * Social Sharing — the query behind the public page.
 *
 * This is the application's only unauthenticated read, so the tests
 * check the shape of the query itself rather than just its result:
 * shareability has to be enforced in the `where` clause, and the
 * `select` has to stay an allowlist. A filter applied after the read
 * would still have pulled the row — and a widened `select` would leak
 * the moment someone adds a column to `songs`.
 */
function fakeClient(record: unknown) {
  const findFirst = vi.fn().mockResolvedValue(record);
  return { findFirst, client: { song: { findFirst } } as unknown as PrismaClient };
}

const RECORD = {
  duration: 60,
  audioStorageKey: "songs/lead-1.mp3",
  lead: { babyName: "Zara" },
};

const TOKEN = "a".repeat(64);

describe("PrismaPublicSongShareGate", () => {
  it("returns only the baby's name, the duration and the storage key", async () => {
    const { client } = fakeClient(RECORD);

    const view = await new PrismaPublicSongShareGate(client).findShareableByToken(TOKEN);

    expect(view).toEqual({
      babyName: "Zara",
      duration: 60,
      audioStorageKey: "songs/lead-1.mp3",
    });
  });

  it("requires COMPLETED and stored audio in the query, not after it", async () => {
    const { client, findFirst } = fakeClient(RECORD);

    await new PrismaPublicSongShareGate(client).findShareableByToken(TOKEN);

    expect(findFirst.mock.calls[0][0].where).toEqual({
      publicShareToken: TOKEN,
      status: SongStatus.COMPLETED,
      audioStorageKey: { not: null },
    });
  });

  it("selects an allowlist, so a new column on `songs` cannot leak", async () => {
    const { client, findFirst } = fakeClient(RECORD);

    await new PrismaPublicSongShareGate(client).findShareableByToken(TOKEN);

    const select = findFirst.mock.calls[0][0].select;
    expect(select).toEqual({
      duration: true,
      audioStorageKey: true,
      lead: { select: { babyName: true } },
    });
    // The fields a stranger must never receive are not even requested.
    for (const forbidden of [
      "id",
      "leadId",
      "lyricsId",
      "provider",
      "status",
      "publicShareToken",
    ]) {
      expect(select).not.toHaveProperty(forbidden);
    }
    expect(select.lead.select).not.toHaveProperty("email");
    expect(select.lead.select).not.toHaveProperty("parentName");
    expect(select.lead.select).not.toHaveProperty("resumeToken");
  });

  it("returns null when nothing matches, without distinguishing why", async () => {
    const { client } = fakeClient(null);

    expect(await new PrismaPublicSongShareGate(client).findShareableByToken(TOKEN)).toBeNull();
  });

  it("refuses an empty token without querying, so it can never match a null column", async () => {
    const { client, findFirst } = fakeClient(RECORD);

    expect(await new PrismaPublicSongShareGate(client).findShareableByToken("")).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("treats a row whose audio vanished between write and read as not shareable", async () => {
    const { client } = fakeClient({ ...RECORD, audioStorageKey: null });

    expect(await new PrismaPublicSongShareGate(client).findShareableByToken(TOKEN)).toBeNull();
  });

  it("wraps a database failure without putting the token in the error", async () => {
    const client = {
      song: { findFirst: vi.fn().mockRejectedValue(new Error("connection lost")) },
    } as unknown as PrismaClient;

    const gate = new PrismaPublicSongShareGate(client);

    await expect(gate.findShareableByToken(TOKEN)).rejects.toThrow();
    await gate.findShareableByToken(TOKEN).catch((error: unknown) => {
      expect(JSON.stringify((error as { context?: unknown }).context)).not.toContain(TOKEN);
    });
  });
});
