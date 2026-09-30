import type {
  PublicSongShareGate,
  PublicSongShareView,
  SongShareTarget,
} from "@/application/song/contracts/PublicSongShareGate";
import { type PrismaClient, SongStatus } from "@/generated/prisma/client";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Social Sharing — resolves a public share token to the little a stranger
 * may see of a song.
 *
 * Three deliberate properties:
 *
 * 1. **The token is the whole lookup.** `publicShareToken` is unique, so
 *    this is an index seek on a 256-bit random value; the song id never
 *    appears in a public URL and cannot be enumerated.
 * 2. **Shareability is enforced in the `where`, not after the read.** A
 *    song that is not `COMPLETED`, or that has no stored audio, is not
 *    returned at all — so a song still generating, or one that failed,
 *    has no public page even if a token somehow exists. Clearing the
 *    token revokes the link the same way, because the lookup can then
 *    never match.
 * 3. **`select` is an allowlist.** Only the three fields the view
 *    declares are read. Adding a column to `songs` cannot widen what
 *    this returns, and a deleted lead takes its song with it
 *    (`onDelete: Cascade`), so the link dies with the family's data.
 */
export class PrismaPublicSongShareGate implements PublicSongShareGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  /**
   * The one definition of "this song has a public page": the token
   * matches, the song finished, and its audio is stored. Both reads
   * below build their `where` from this, so the page and the share
   * tracker can never disagree about what is shareable — and revoking a
   * link by clearing the token kills both at once.
   */
  private static shareableWhere(shareToken: string) {
    return {
      publicShareToken: shareToken,
      status: SongStatus.COMPLETED,
      audioStorageKey: { not: null },
    };
  }

  async findShareableByToken(shareToken: string): Promise<PublicSongShareView | null> {
    // Guarded before the query: an empty token must never be allowed to
    // become a `where` that matches a row with a null token.
    if (!shareToken) return null;

    try {
      const record = await this.client.song.findFirst({
        where: PrismaPublicSongShareGate.shareableWhere(shareToken),
        select: {
          duration: true,
          audioStorageKey: true,
          lead: { select: { babyName: true } },
        },
      });

      if (!record?.audioStorageKey) return null;

      return {
        babyName: record.lead.babyName,
        duration: record.duration,
        audioStorageKey: record.audioStorageKey,
      };
    } catch (cause) {
      throw new DatabaseError("Failed to resolve a public song share token.", {
        code: "song.public_share_lookup_failed",
        cause,
        // Never the token itself: this message can reach a log, and the
        // token is the credential.
        context: { operation: "findShareableByToken" },
      });
    }
  }

  async findShareTargetByToken(shareToken: string): Promise<SongShareTarget | null> {
    if (!shareToken) return null;

    try {
      const record = await this.client.song.findFirst({
        where: PrismaPublicSongShareGate.shareableWhere(shareToken),
        select: { id: true, leadId: true },
      });

      return record ? { songId: record.id, leadId: record.leadId } : null;
    } catch (cause) {
      throw new DatabaseError("Failed to resolve a song share target.", {
        code: "song.share_target_lookup_failed",
        cause,
        context: { operation: "findShareTargetByToken" },
      });
    }
  }
}
