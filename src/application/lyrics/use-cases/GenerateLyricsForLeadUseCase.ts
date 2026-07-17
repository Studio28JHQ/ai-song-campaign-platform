import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import { LeadStatus } from "@/domain/lead/types";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  describeTextValidationFailure,
  FIELD_LIMITS,
  sanitizePlainText,
} from "@/shared/validation/text";
import type { LyricsGenerator } from "../contracts/LyricsGenerator";
import type { GenerateLyricsForLeadRequest } from "../dto/GenerateLyricsForLeadRequest";
import type { GenerateLyricsForLeadResponse } from "../dto/GenerateLyricsForLeadResponse";
import { GenerateLyricsUseCase } from "./GenerateLyricsUseCase";

// Sprint UI-3C — UX Polish: was "en", which contradicted the Claude
// prompt's own language rules (see `PromptBuilder`) and could produce
// English or mixed-language lyrics for this entirely Spanish-speaking
// campaign. This is prompt content, not a flow change — every other
// step of generation is untouched.
const DEFAULT_LANGUAGE = "es";

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
    const parentMessage = GenerateLyricsForLeadUseCase.sanitizeParentMessage(request.parentMessage);

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

    const alreadyApproved = await this.lyricsRepository.findApprovedByLead(lead.id);
    if (alreadyApproved) {
      throw new BusinessRuleError("This lead already has an approved lyrics version.", {
        code: "lyrics.already_approved",
        context: { leadId: lead.id, lyricsId: alreadyApproved.id },
      });
    }

    const existingVersions = await this.lyricsRepository.findAllByLead(lead.id);
    const isRegeneration = existingVersions.length > 0;

    if (lead.status === LeadStatus.REGISTERED) {
      lead.startGenerating();
    }

    const result = await this.lyricsGenerator.generateAndModerate({
      babyName: lead.babyName,
      parentMessage,
      mood: { name: request.moodName, description: request.moodDescription },
      language: DEFAULT_LANGUAGE,
    });

    if (isRegeneration || !result.approved) {
      const remainingAttemptsBeforeConsumption = lead.remainingAttempts;
      lead.consumeAttempt();

      const persisted = await this.leadRepository.updateAttemptConsumption(
        lead,
        remainingAttemptsBeforeConsumption,
      );

      if (!persisted) {
        throw new BusinessRuleError("No remaining attempts left to generate lyrics.", {
          code: "lyrics.no_remaining_attempts",
          context: { leadId: lead.id },
        });
      }
    } else {
      await this.leadRepository.update(lead);
    }

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
      prompt: `Mood: ${request.moodName}. Parent message: ${parentMessage}`,
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

  /** Sprint 8.1 input hardening for the custom lyrics message — see `@/shared/validation`. */
  private static sanitizeParentMessage(raw: string): string {
    const result = sanitizePlainText(raw, FIELD_LIMITS.lyricsMessage);
    if (!result.ok) {
      throw new ValidationError(
        describeTextValidationFailure("Your message", result.reason, FIELD_LIMITS.lyricsMessage),
        { code: "lyrics.invalid_parent_message" },
      );
    }
    return result.value;
  }
}
