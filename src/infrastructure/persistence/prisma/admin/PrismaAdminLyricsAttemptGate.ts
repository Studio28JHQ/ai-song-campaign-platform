import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AdminLyricsAttemptGate,
  AdminLyricsAttemptView,
} from "@/application/admin/contracts/AdminLyricsAttemptGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Sprint FINAL-2 — Lyrics Generation Traceability. Thin Prisma adapter
 * satisfying `AdminLyricsAttemptGate`: a lead's recorded provider calls,
 * oldest first, so the Lead Detail screen reads in the order the calls
 * actually happened.
 *
 * Unbounded on purpose: a lead can accumulate at most
 * `MAX_LYRIC_ATTEMPTS` (3) functional attempts × 3 provider calls each,
 * so there is nothing here to paginate.
 */
export class PrismaAdminLyricsAttemptGate implements AdminLyricsAttemptGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async findByLead(leadId: string): Promise<AdminLyricsAttemptView[]> {
    try {
      const records = await this.client.generationAttempt.findMany({
        where: { leadId },
        orderBy: { attemptNumber: "asc" },
        select: {
          attemptNumber: true,
          result: true,
          errorCode: true,
          failureReason: true,
          providerModel: true,
          createdAt: true,
          completedAt: true,
        },
      });

      return records.map((record) => ({
        attemptNumber: record.attemptNumber,
        result: record.result,
        errorCode: record.errorCode,
        failureReason: record.failureReason,
        providerModel: record.providerModel,
        createdAt: record.createdAt,
        completedAt: record.completedAt,
      }));
    } catch (cause) {
      throw new DatabaseError("Failed to read the lead's lyrics generation attempts.", {
        code: "admin.lyrics_attempts_read_failed",
        cause,
        context: { leadId },
      });
    }
  }
}
