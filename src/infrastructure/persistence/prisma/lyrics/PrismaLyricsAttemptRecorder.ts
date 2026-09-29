import type { PrismaClient } from "@/generated/prisma/client";
import type {
  LyricsAttemptFinish,
  LyricsAttemptHandle,
  LyricsAttemptRecorder,
  LyricsAttemptStart,
} from "@/application/lyrics/contracts/LyricsAttemptRecorder";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Sprint FINAL-2 — Lyrics Generation Traceability. Thin Prisma adapter
 * satisfying `LyricsAttemptRecorder`: writes one `GenerationAttempt` row
 * per real provider call, opened as `STARTED` before the call and closed
 * with its outcome afterwards.
 *
 * Two deliberate choices:
 *
 * 1. **The attempt number is derived here, not passed in.** It is the
 *    lead's next provider-call ordinal over its whole lifetime, so it
 *    cannot be counted in memory within one request — a lead's second
 *    generation would restart at 1 and collide with the row the first one
 *    already wrote. `MAX(attemptNumber) + 1` over the lead's rows is the
 *    only source that survives across requests, and the table's
 *    `@@unique([leadId, attemptNumber])` is what makes a mistake here
 *    loud: a concurrent double-submit raises a unique violation, which
 *    the caller logs and swallows, instead of silently writing two rows
 *    numbered the same.
 * 2. **It throws on failure.** Swallowing belongs in the caller, in one
 *    place, and is already implemented there (`ClaudeLyricsService`) —
 *    an adapter that hid its own errors would also hide them from the
 *    logs.
 */
export class PrismaLyricsAttemptRecorder implements LyricsAttemptRecorder {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async attemptStarted(input: LyricsAttemptStart): Promise<LyricsAttemptHandle> {
    try {
      const previous = await this.client.generationAttempt.aggregate({
        where: { leadId: input.leadId },
        _max: { attemptNumber: true },
      });

      const created = await this.client.generationAttempt.create({
        data: {
          leadId: input.leadId,
          attemptNumber: (previous._max.attemptNumber ?? 0) + 1,
          result: "STARTED",
          providerModel: input.providerModel,
        },
        select: { id: true },
      });

      return { id: created.id };
    } catch (cause) {
      throw new DatabaseError("Failed to open a lyrics generation attempt record.", {
        code: "lyrics_attempt.start_failed",
        cause,
        context: { leadId: input.leadId },
      });
    }
  }

  async attemptFinished(handle: LyricsAttemptHandle, outcome: LyricsAttemptFinish): Promise<void> {
    try {
      await this.client.generationAttempt.update({
        where: { id: handle.id },
        data: {
          result: outcome.result,
          errorCode: outcome.errorCode,
          failureReason: outcome.failureReason,
          completedAt: new Date(),
        },
      });
    } catch (cause) {
      throw new DatabaseError("Failed to close a lyrics generation attempt record.", {
        code: "lyrics_attempt.finish_failed",
        cause,
        context: { attemptId: handle.id, result: outcome.result },
      });
    }
  }
}
