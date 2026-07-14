import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { GetLeadSessionStateRequest } from "../dto/GetLeadSessionStateRequest";
import type { GetLeadSessionStateResponse } from "../dto/GetLeadSessionStateResponse";

/**
 * Reconstructs everything the parent-facing UI needs to resume the flow
 * after a page refresh — remaining attempts, the approved Lyrics version
 * (if any), and the current Song (if any) — entirely from existing
 * repositories, mirroring the Admin module's `GetLeadDetailUseCase`
 * composition pattern. This is the backend authority GATE 6.6 requires:
 * the frontend never reconstructs this state from client-side storage.
 */
export class GetLeadSessionStateUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly lyricsRepository: LyricsRepository,
    private readonly songRepository: SongRepository,
  ) {}

  async execute(request: GetLeadSessionStateRequest): Promise<GetLeadSessionStateResponse> {
    const lead = await this.leadRepository.findById(request.leadId);

    if (!lead) {
      throw new BusinessRuleError("Lead not found.", {
        code: "session.lead_not_found",
        context: { leadId: request.leadId },
      });
    }

    const [approvedLyrics, song] = await Promise.all([
      this.lyricsRepository.findApprovedByLead(lead.id),
      this.songRepository.findByLead(lead.id),
    ]);

    return {
      babyName: lead.babyName,
      remainingAttempts: lead.remainingAttempts,
      leadStatus: lead.status,
      approvedLyrics: approvedLyrics
        ? {
            id: approvedLyrics.id,
            content: approvedLyrics.content,
            version: approvedLyrics.version,
          }
        : null,
      song: song
        ? { id: song.id, status: song.status, audioUrl: song.audioUrl, duration: song.duration }
        : null,
    };
  }
}
