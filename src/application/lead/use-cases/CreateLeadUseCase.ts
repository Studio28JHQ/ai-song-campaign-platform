import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import { Email } from "@/domain/lead/value-objects/Email";
import { BusinessRuleError } from "@/shared/errors";
import type { LeadCampaignConfig } from "../contracts/LeadCampaignConfig";
import type { CreateLeadRequest } from "../dto/CreateLeadRequest";
import type { CreateLeadResponse } from "../dto/CreateLeadResponse";

/**
 * Registers a new Lead for the active campaign.
 *
 * Orchestrates the `Lead` aggregate through its repository contract only —
 * no persistence, no HTTP, and no infrastructure-level validation happen
 * here (see docs/Architecture/Domain_Model.md).
 */
export class CreateLeadUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly campaignConfig: LeadCampaignConfig,
  ) {}

  async execute(request: CreateLeadRequest): Promise<CreateLeadResponse> {
    const email = Email.create(request.email);

    const alreadyRegistered = await this.leadRepository.existsByEmail(email);
    if (alreadyRegistered) {
      throw new BusinessRuleError("This email has already been used to register a lead.", {
        code: "lead.email_already_registered",
        context: { email: email.toString() },
      });
    }

    const maxAttempts = this.campaignConfig.getMaxLyricAttempts();

    const lead = Lead.create(
      {
        campaignId: request.campaignId,
        parentName: request.parentName,
        babyName: request.babyName,
        babyAge: request.babyAge,
        city: request.city,
        email: request.email,
        phone: request.phone,
      },
      maxAttempts,
    );

    const persisted = await this.leadRepository.create(lead);

    return { lead: persisted.toSnapshot() };
  }
}
