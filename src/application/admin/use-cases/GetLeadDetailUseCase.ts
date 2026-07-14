import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { GetLeadDetailRequest } from "../dto/GetLeadDetailRequest";
import type { GetLeadDetailResponse } from "../dto/GetLeadDetailResponse";

/**
 * Composes the read-only Lead Detail screen (see docs/Product/User_Flow.md)
 * entirely from existing repositories — the Lead, its full Lyrics
 * history, the approved version, its Song, and the audit trail. No
 * business rule is duplicated here; this is a pure read/aggregation, and
 * the only mutation is the audit trail entry created for the view itself.
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

    const auditHistory = await this.auditLogRepository.findByEntity("Lead", lead.id);

    return {
      lead: lead.toSnapshot(),
      lyricsHistory: lyricsHistory.map((entry) => entry.toSnapshot()),
      approvedLyrics: approvedLyrics?.toSnapshot() ?? null,
      song: song?.toSnapshot() ?? null,
      auditHistory: auditHistory.map((entry) => entry.toSnapshot()),
    };
  }
}
