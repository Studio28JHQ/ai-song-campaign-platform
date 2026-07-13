import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import { LeadStatus } from "@/domain/lead/types";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { LyricsGenerator } from "../contracts/LyricsGenerator";
import type { GenerateLyricsForLeadRequest } from "../dto/GenerateLyricsForLeadRequest";
import type { GenerateLyricsForLeadResponse } from "../dto/GenerateLyricsForLeadResponse";
import { GenerateLyricsUseCase } from "./GenerateLyricsUseCase";

const DEFAULT_LANGUAGE = "en";

/**
 * Orchestrates a full lyrics generation request for a lead: validates the
 * lead and its remaining attempts, performs the single Claude
 * moderation+generation call, applies the attempt-consumption rule (see
 * docs/Product/Business_Rules.md — Attempts Rules), and — only when
 * approved — delegates to the existing `GenerateLyricsUseCase` to persist
 * a new lyrics version. Rejections never create a Lyrics record: there is
 * no generated content to store as a version.
 *
 * Attempt consumption: a lead's very first (non-regeneration) generation
 * costs nothing if approved. Every other case — a rejection (first or
 * later attempt) or an explicit regeneration (approved or not) — consumes
 * exactly one attempt. "Is this a regeneration?" is derived from whether
 * the lead already has any Lyrics versions, not from client input.
 */
export class GenerateLyricsForLeadUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly lyricsRepository: LyricsRepository,
    private readonly lyricsGenerator: LyricsGenerator,
  ) {}

  async execute(request: GenerateLyricsForLeadRequest): Promise<GenerateLyricsForLeadResponse> {
    const lead = await this.leadRepository.findById(request.leadId);

    if (!lead) {
      throw new BusinessRuleError("Lead not found.", {
        code: "lyrics.lead_not_found",
        context: { leadId: request.leadId },
      });
    }

    if (lead.remainingAttempts <= 0) {
      throw new BusinessRuleError("No remaining attempts left to generate lyrics.", {
        code: "lyrics.no_remaining_attempts",
        context: { leadId: lead.id },
      });
    }

    const existingVersions = await this.lyricsRepository.findAllByLead(lead.id);
    const isRegeneration = existingVersions.length > 0;

    if (lead.status === LeadStatus.REGISTERED) {
      lead.startGenerating();
    }

    const result = await this.lyricsGenerator.generateAndModerate({
      babyName: lead.babyName,
      parentMessage: request.parentMessage,
      mood: { name: request.moodName, description: request.moodDescription },
      language: DEFAULT_LANGUAGE,
    });

    if (isRegeneration || !result.approved) {
      lead.consumeAttempt();
    }

    await this.leadRepository.update(lead);

    if (!result.approved) {
      return {
        lyrics: null,
        approved: false,
        reason: result.reason,
        remainingAttempts: lead.remainingAttempts,
        leadStatus: lead.status,
      };
    }

    const generated = await new GenerateLyricsUseCase(this.lyricsRepository).execute({
      leadId: lead.id,
      moodId: request.moodId,
      prompt: `Mood: ${request.moodName}. Parent message: ${request.parentMessage}`,
      content: result.lyrics as string,
    });

    return {
      lyrics: generated.lyrics,
      approved: true,
      reason: null,
      remainingAttempts: lead.remainingAttempts,
      leadStatus: lead.status,
    };
  }
}
