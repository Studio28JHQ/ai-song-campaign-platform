import type { ConsentRepository } from "@/domain/consent/repositories/ConsentRepository";
import type { AssociateConsentWithLeadRequest } from "../dto/AssociateConsentWithLeadRequest";

/**
 * Associates an existing, anonymous Consent with a newly registered Lead,
 * looked up by the visitor's `sessionId` — never creates a second
 * Consent, only updates the existing record. A visitor who registers
 * without ever having accepted the privacy banner (no session, or no
 * matching Consent) is a silent no-op: consent is not a prerequisite for
 * registration, only something to link when it already exists.
 */
export class AssociateConsentWithLeadUseCase {
  constructor(private readonly consentRepository: ConsentRepository) {}

  async execute(request: AssociateConsentWithLeadRequest): Promise<void> {
    if (!request.sessionId) {
      return;
    }

    const consent = await this.consentRepository.findBySessionId(request.sessionId);
    if (!consent || consent.leadId === request.leadId) {
      return;
    }

    consent.associateWithLead(request.leadId);
    await this.consentRepository.update(consent);
  }
}
