import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AdminLeadDeletionGate,
  AdminLeadDeletionSummary,
} from "@/application/admin/contracts/AdminLeadDeletionGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Sprint FINAL-5 — Test Data Cleanup. Thin Prisma adapter satisfying
 * `AdminLeadDeletionGate`.
 *
 * ## Why one `delete` and no transaction block
 *
 * Deleting the family row is enough, and it is already atomic. Every
 * table that belongs to a family declares `ON DELETE CASCADE` on its
 * foreign key — `lyrics`, `songs`, `generation_attempts`,
 * `lead_sessions` — so PostgreSQL removes them as part of the same
 * statement. A single statement either commits whole or not at all, so
 * there is no state in which a family is gone and its songs remain, and
 * wrapping it in an explicit transaction would add nothing but a
 * round-trip.
 *
 * This was verified against the real schema rather than assumed, because
 * one constraint made it genuinely uncertain: `songs.lyricsId` is
 * `ON DELETE RESTRICT`, and the cascade deletes a family's lyrics and
 * its song from the same statement. A `RESTRICT` that fired before the
 * song row was gone would abort the whole delete. It does not —
 * PostgreSQL resolves the cascade as one unit — confirmed by running
 * this exact delete inside a transaction that was then rolled back, on a
 * family with a song, a lyric, an attempt and a session: all four
 * dependents went to zero and nothing outside the family was touched.
 *
 * ## What is deliberately not deleted
 *
 * The audio itself lives in R2, outside any database transaction, and is
 * removed separately by `DeleteLeadUseCase` — see `findAudioStorageKeys`.
 *
 * `consents.leadId` is `ON DELETE SET NULL`, so the consent record
 * survives, unlinked. That is the schema's existing, deliberate choice
 * (see `docs/Architecture/Database_Model.md`): a consent is a record
 * that a human accepted a privacy policy at a moment in time, and it is
 * not the campaign's to erase because a test family was cleaned up.
 * Moods, campaigns, admin users and audit entries are shared or global
 * and are never touched.
 */
export class PrismaAdminLeadDeletionGate implements AdminLeadDeletionGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async findDeletionSummary(leadId: string): Promise<AdminLeadDeletionSummary | null> {
    try {
      const lead = await this.client.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          parentName: true,
          babyName: true,
          email: true,
          // A family has at most one song — `songs.leadId` is unique — so
          // the relation is to-one and Prisma offers no `_count` for it.
          song: { select: { id: true } },
        },
      });

      if (!lead) return null;

      return {
        id: lead.id,
        parentName: lead.parentName,
        babyName: lead.babyName,
        email: lead.email,
        songCount: lead.song ? 1 : 0,
      };
    } catch (cause) {
      throw new DatabaseError("Unexpected database error while reading a family for deletion.", {
        code: "admin.unexpected_database_error",
        cause,
        context: { operation: "findDeletionSummary", leadId },
      });
    }
  }

  async findAudioStorageKeys(leadId: string): Promise<string[]> {
    try {
      const songs = await this.client.song.findMany({
        where: { leadId },
        select: { audioStorageKey: true },
      });

      // Scoped to this family's own songs by `leadId`, and filtered to
      // the ones that actually have audio: a queued, generating or
      // failed song has no key, and a missing key must never become an
      // empty-string delete.
      return songs
        .map((song) => song.audioStorageKey)
        .filter((key): key is string => typeof key === "string" && key.trim().length > 0);
    } catch (cause) {
      throw new DatabaseError("Unexpected database error while reading a family's audio keys.", {
        code: "admin.unexpected_database_error",
        cause,
        context: { operation: "findAudioStorageKeys", leadId },
      });
    }
  }

  async delete(leadId: string): Promise<boolean> {
    try {
      // `deleteMany` rather than `delete`: a family that is already gone
      // is not an error worth raising — the caller has already decided
      // what a count of zero means.
      const result = await this.client.lead.deleteMany({ where: { id: leadId } });
      return result.count === 1;
    } catch (cause) {
      throw new DatabaseError("Unexpected database error while deleting a family.", {
        code: "admin.unexpected_database_error",
        cause,
        context: { operation: "deleteLead", leadId },
      });
    }
  }
}
