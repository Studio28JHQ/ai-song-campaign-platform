import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import { BusinessRuleError } from "@/shared/errors";
import type { SongEmailSender } from "@/application/song/contracts/SongEmailSender";
import type { ResendSongEmailRequest } from "../dto/ResendSongEmailRequest";
import type { ResendSongEmailResponse } from "../dto/ResendSongEmailResponse";

/**
 * The manual "Resend email" operational recovery action (see
 * docs/Product/User_Flow.md — Operational Recovery). Only ever available
 * once the Song is `READY` (`COMPLETED`, in the public vocabulary) *and*
 * the one-time automatic email has already gone out (`Song.emailedAt`
 * set) — this is a deliberate extra copy for a parent who says they
 * never received it, never a substitute for the automatic delivery.
 *
 * This never touches `EmailDeliveryTracker`'s atomic claim (see
 * docs/Architecture/External_Services.md) — that guarantees the
 * *automatic* email is sent exactly once; a manual resend is a distinct,
 * explicitly admin-initiated, audited action and must never re-arm or
 * interact with that claim, so it can never trigger a second *automatic*
 * delivery.
 */
export class ResendSongEmailUseCase {
  constructor(
    private readonly songRepository: SongRepository,
    private readonly leadRepository: LeadRepository,
    private readonly emailSender: SongEmailSender,
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  async execute(request: ResendSongEmailRequest): Promise<ResendSongEmailResponse> {
    const song = await this.songRepository.findById(request.songId);

    if (!song) {
      throw new BusinessRuleError("Song not found.", {
        code: "admin.song_not_found",
        context: { songId: request.songId },
      });
    }

    if (song.status !== SongStatus.READY) {
      throw new BusinessRuleError("Only a completed song's email can be resent.", {
        code: "admin.song_not_completed",
        context: { songId: song.id, status: song.status },
      });
    }

    if (!song.emailedAt || !song.audioUrl) {
      throw new BusinessRuleError("This song's email has not been sent yet.", {
        code: "admin.email_not_sent_yet",
        context: { songId: song.id },
      });
    }

    const lead = await this.leadRepository.findById(song.leadId);

    if (!lead) {
      throw new BusinessRuleError("Lead not found.", {
        code: "admin.lead_not_found",
        context: { leadId: song.leadId },
      });
    }

    await this.emailSender.sendSongReadyEmail({
      to: lead.email.toString(),
      parentName: lead.parentName,
      babyName: lead.babyName,
      songId: song.id,
      audioUrl: song.audioUrl,
      duration: song.duration,
    });

    await this.auditLogRepository.create(
      AuditLogEntry.create({
        adminId: request.adminId,
        action: "resend_email",
        entity: "Song",
        entityId: song.id,
        metadata: { reason: request.reason },
      }),
    );

    return { success: true };
  }
}
