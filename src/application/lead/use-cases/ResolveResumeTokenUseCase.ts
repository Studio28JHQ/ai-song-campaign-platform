import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { ResolveResumeTokenRequest } from "../dto/ResolveResumeTokenRequest";
import type { ResolveResumeTokenResponse } from "../dto/ResolveResumeTokenResponse";

/**
 * "Resume journey by email" — resolves the token from an emailed resume
 * link back to a lead and the next step of the *existing* workflow. Reuses
 * `LyricsRepository.findApprovedByLead` — the exact same query
 * `GetLeadSessionStateUseCase` already uses to reconstruct session state —
 * rather than inventing a parallel state machine; the resolved
 * `destination` page (`/generate` or `/song`) re-derives everything else
 * itself via the existing `GET /api/leads/session` on mount.
 */
export class ResolveResumeTokenUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly lyricsRepository: LyricsRepository,
  ) {}

  async execute(request: ResolveResumeTokenRequest): Promise<ResolveResumeTokenResponse> {
    const lead = await this.leadRepository.findByResumeToken(request.token);

    if (!lead) {
      throw new BusinessRuleError("Resume link is invalid or has been revoked.", {
        code: "lead.resume_token_invalid",
      });
    }

    const approvedLyrics = await this.lyricsRepository.findApprovedByLead(lead.id);

    return {
      leadId: lead.id,
      destination: approvedLyrics ? "song" : "generate",
    };
  }
}
