import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { ApproveLyricsRequest } from "../dto/ApproveLyricsRequest";
import type { ApproveLyricsResponse } from "../dto/ApproveLyricsResponse";

/**
 * Approves a lyrics version for a lead — the only version a Song may
 * later be generated from. Enforces "only one Lyrics record can be
 * approved per lead" at the application level (a repository lookup the
 * entity itself cannot perform), backstopped by the entity's own
 * "cannot be approved twice" invariant and, ultimately, a database
 * constraint (see docs/Architecture/Database_Model.md).
 */
export class ApproveLyricsUseCase {
  constructor(private readonly lyricsRepository: LyricsRepository) {}

  async execute(request: ApproveLyricsRequest): Promise<ApproveLyricsResponse> {
    const lyrics = await this.lyricsRepository.findById(request.lyricsId);

    if (!lyrics) {
      throw new BusinessRuleError("Lyrics not found.", {
        code: "lyrics.not_found",
        context: { lyricsId: request.lyricsId },
      });
    }

    const existingApproved = await this.lyricsRepository.findApprovedByLead(lyrics.leadId);

    if (existingApproved && existingApproved.id !== lyrics.id) {
      throw new BusinessRuleError("This lead already has an approved lyrics version.", {
        code: "lyrics.lead_already_has_approved_version",
        context: { leadId: lyrics.leadId, approvedLyricsId: existingApproved.id },
      });
    }

    lyrics.approve();

    const persisted = await this.lyricsRepository.approve(lyrics);

    return { lyrics: persisted.toSnapshot() };
  }
}
