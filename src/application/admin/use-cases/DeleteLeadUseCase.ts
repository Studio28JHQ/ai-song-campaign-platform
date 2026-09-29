import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import type { AdminLeadDeletionGate } from "../contracts/AdminLeadDeletionGate";
import type { AudioStorageCleaner } from "../contracts/AudioStorageCleaner";
import type { DeleteLeadRequest } from "../dto/DeleteLeadRequest";
import type { DeleteLeadResponse } from "../dto/DeleteLeadResponse";

/**
 * Sprint FINAL-5 — Test Data Cleanup. Permanently removes one family and
 * everything that belongs only to it.
 *
 * This exists for a specific, bounded need: roughly fifty families were
 * created while developing against the shared database, and they are
 * counted by every statistic the campaign reports. A soft delete would
 * not solve that — the rows would still be there to count — so this is a
 * real delete, and it is irreversible.
 *
 * Three things it deliberately does not do:
 *
 * - **It does not delete in bulk.** One family per call, named by id.
 *   Fifty deliberate clicks are a feature when the operation cannot be
 *   undone.
 * - **It does not accept a name or an email.** The gate takes the id, so
 *   there is no query-shaped input that could match more than intended.
 * - **It does not decide what "belongs only to it" means.** The schema
 *   already does, through its cascades; see
 *   `PrismaAdminLeadDeletionGate` for what that covers and what it
 *   deliberately leaves behind.
 *
 * ## The audio, and why it is not part of the transaction
 *
 * A completed song's audio lives in R2, which is a different system with
 * no share in PostgreSQL's transaction. There is no atomic delete across
 * the two, and pretending otherwise would only add failure modes, so the
 * order is chosen to make the *survivable* failure the likely one:
 *
 * 1. read the storage keys, while the rows that hold them still exist;
 * 2. delete the family — one statement, atomic, exactly as before;
 * 3. only then delete the audio.
 *
 * If step 3 fails, the database is already consistent and the operator's
 * request genuinely succeeded; what is left is one unreferenced object
 * in a bucket, logged with its key and the family it belonged to so it
 * can be cleaned up by hand. Reporting that as a failed deletion would
 * be worse than the orphan: it would invite a retry on a family that no
 * longer exists, and the audio would still be there.
 *
 * The reverse order would trade that for the unrecoverable failure —
 * audio deleted, family still listed, and a song the panel offers to
 * play that no longer has a file.
 *
 * The summary is read *before* the delete because afterwards there is
 * nothing left to read: it is what the caller confirms back to the
 * operator, and what the audit trail records.
 */
export class DeleteLeadUseCase {
  constructor(
    private readonly deletionGate: AdminLeadDeletionGate,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly audioStorage: AudioStorageCleaner,
  ) {}

  async execute(request: DeleteLeadRequest): Promise<DeleteLeadResponse> {
    const summary = await this.deletionGate.findDeletionSummary(request.leadId);

    if (!summary) {
      throw new BusinessRuleError("Family not found.", {
        code: "admin.lead_not_found",
        context: { leadId: request.leadId },
      });
    }

    // Read before the delete: afterwards the songs that hold these keys
    // are gone, and with them any way to find the files they pointed at.
    const audioStorageKeys = await this.deletionGate.findAudioStorageKeys(request.leadId);

    const deleted = await this.deletionGate.delete(request.leadId);

    if (!deleted) {
      // It existed a moment ago and does not now: someone else deleted it
      // between the two calls. Reported as "not found" because that is
      // what the operator needs to know, and nothing was lost.
      throw new BusinessRuleError("Family not found.", {
        code: "admin.lead_not_found",
        context: { leadId: request.leadId },
      });
    }

    await this.deleteAudio(request.leadId, audioStorageKeys);
    await this.recordDeletion(request.adminId, summary);

    return { deleted: summary };
  }

  /**
   * Removes the family's audio from storage, one object at a time.
   *
   * Never throws: the database delete has already committed by the time
   * this runs, so there is nothing left to roll back and nothing the
   * operator could usefully do with the error. A failure is logged with
   * the key and the family it belonged to — enough to find and remove
   * the object by hand — and the deletion is still a success, because it
   * was one.
   *
   * Each key is deleted on its own so one failure cannot prevent the
   * rest, and only keys read from this family's own songs are ever
   * passed in.
   */
  private async deleteAudio(leadId: string, keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.audioStorage.delete(key);
      } catch (error) {
        logger.error("Deleted a family but could not remove its audio from storage", {
          leadId,
          audioStorageKey: key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * The audit entry, written after the delete has succeeded — the same
   * order `RetryFailedSongUseCase` uses, so the trail never claims an
   * action that did not happen.
   *
   * It is best-effort on purpose: the family is already gone, and
   * throwing here would report a failure for an operation that
   * succeeded, which would invite the operator to try again on a row
   * that no longer exists. A failure to write it is logged loudly
   * instead, since it is the only record that the deletion took place.
   *
   * The metadata keeps what the row itself no longer can: who it was.
   * `entityId` is the id, which now points at nothing — that is the
   * nature of a deletion record, and `audit_logs` has no foreign key
   * precisely because it outlives what it describes.
   */
  private async recordDeletion(
    adminId: string,
    summary: DeleteLeadResponse["deleted"],
  ): Promise<void> {
    try {
      await this.auditLogRepository.create(
        AuditLogEntry.create({
          adminId,
          action: "delete_lead",
          entity: "Lead",
          entityId: summary.id,
          metadata: {
            parentName: summary.parentName,
            babyName: summary.babyName,
            email: summary.email,
            songCount: summary.songCount,
          },
        }),
      );
    } catch (error) {
      logger.error("Deleted a family but could not record it in the audit trail", {
        leadId: summary.id,
        adminId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
