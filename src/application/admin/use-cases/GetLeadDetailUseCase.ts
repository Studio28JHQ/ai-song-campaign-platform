import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus, type SongSnapshot } from "@/domain/song/types";
import { BusinessRuleError } from "@/shared/errors";
import type { ExecutionHistoryItem } from "../dto/ExecutionHistoryItem";
import type { GetLeadDetailRequest } from "../dto/GetLeadDetailRequest";
import type { GetLeadDetailResponse } from "../dto/GetLeadDetailResponse";

/**
 * Composes the read-only Lead Detail screen (see docs/Product/User_Flow.md)
 * entirely from existing repositories — the Lead, its full Lyrics
 * history, the approved version, its Song, and the complete execution
 * history. No business rule is duplicated here; this is a pure
 * read/aggregation, and the only mutation is the audit trail entry
 * created for the view itself.
 */
export class GetLeadDetailUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly lyricsRepository: LyricsRepository,
    private readonly songRepository: SongRepository,
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  async execute(request: GetLeadDetailRequest): Promise<GetLeadDetailResponse> {
    const lead = await this.leadRepository.findById(request.leadId);

    if (!lead) {
      throw new BusinessRuleError("Lead not found.", {
        code: "admin.lead_not_found",
        context: { leadId: request.leadId },
      });
    }

    const [lyricsHistory, approvedLyrics, song] = await Promise.all([
      this.lyricsRepository.findAllByLead(lead.id),
      this.lyricsRepository.findApprovedByLead(lead.id),
      this.songRepository.findByLead(lead.id),
    ]);

    await this.auditLogRepository.create(
      AuditLogEntry.create({
        adminId: request.viewingAdminId,
        action: "view_lead",
        entity: "Lead",
        entityId: lead.id,
      }),
    );

    const executionHistory = await this.buildExecutionHistory(
      lead.id,
      lead.createdAt,
      lyricsHistory.map((entry) => entry.toSnapshot()),
      song?.toSnapshot() ?? null,
    );

    return {
      lead: lead.toSnapshot(),
      lyricsHistory: lyricsHistory.map((entry) => entry.toSnapshot()),
      approvedLyrics: approvedLyrics?.toSnapshot() ?? null,
      song: song?.toSnapshot() ?? null,
      executionHistory,
    };
  }

  /**
   * Merges system events synthesized from already-available
   * Lead/Lyrics/Song timestamps with the real `AuditLogEntry` rows for
   * admin-initiated actions (view/retry/resend), then sorts the result
   * newest-first. See `ExecutionHistoryItem` for why this is a merge of
   * two different kinds of source data rather than one repository call.
   */
  private async buildExecutionHistory(
    leadId: string,
    leadCreatedAt: Date,
    lyricsHistory: Array<{ version: number; createdAt: Date; approved: boolean }>,
    song: SongSnapshot | null,
  ): Promise<ExecutionHistoryItem[]> {
    const history: ExecutionHistoryItem[] = [
      { type: "lead_created", label: "Lead created", timestamp: leadCreatedAt, actor: null },
    ];

    for (const version of lyricsHistory) {
      history.push({
        type: "lyrics_generated",
        label: `Lyrics generated (v${version.version})`,
        timestamp: version.createdAt,
        actor: null,
      });

      if (version.approved) {
        history.push({
          type: "lyrics_approved",
          label: `Lyrics approved (v${version.version})`,
          timestamp: version.createdAt,
          actor: null,
        });
      }
    }

    const leadAuditEntries = await this.auditLogRepository.findByEntity("Lead", leadId);
    for (const entry of leadAuditEntries) {
      if (entry.action === "view_lead") {
        history.push({
          type: "lead_viewed",
          label: "Lead viewed",
          timestamp: entry.createdAt,
          actor: entry.adminId,
        });
      }
    }

    if (song) {
      history.push({
        type: "song_requested",
        label: "Song requested",
        timestamp: song.createdAt,
        actor: null,
      });

      if (song.status === SongStatus.READY && song.generatedAt) {
        history.push({
          type: "song_completed",
          label: "Song completed",
          timestamp: song.generatedAt,
          actor: null,
        });
      }

      if (song.status === SongStatus.FAILED) {
        history.push({
          type: "song_failed",
          label: "Song failed",
          timestamp: song.updatedAt,
          actor: null,
        });
      }

      if (song.emailedAt) {
        history.push({
          type: "email_sent_automatic",
          label: "Automatic email sent",
          timestamp: song.emailedAt,
          actor: null,
        });
      }

      const songAuditEntries = await this.auditLogRepository.findByEntity("Song", song.id);
      for (const entry of songAuditEntries) {
        if (entry.action === "resend_email") {
          const reason = entry.metadata?.reason;
          history.push({
            type: "email_resent_manual",
            label: "Manual email resent",
            timestamp: entry.createdAt,
            actor: entry.adminId,
            detail: typeof reason === "string" ? reason : null,
          });
        } else if (entry.action === "retry_song") {
          history.push({
            type: "song_retried",
            label: "Retry executed",
            timestamp: entry.createdAt,
            actor: entry.adminId,
          });
        }
      }
    }

    return history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}
