import { Consent } from "@/domain/consent/entities/Consent";
import type { ConsentRepository } from "@/domain/consent/repositories/ConsentRepository";
import type { RecordConsentRequest } from "../dto/RecordConsentRequest";
import type { RecordConsentResponse } from "../dto/RecordConsentResponse";

/**
 * Records the visitor's acceptance of the cookie/privacy banner.
 * "Exactly one Consent per session, never duplicated": if a Consent
 * already exists for this `sessionId` (e.g. a duplicate accept click, or
 * the request retried), it is returned as-is rather than creating a
 * second row.
 */
export class RecordConsentUseCase {
  constructor(private readonly consentRepository: ConsentRepository) {}

  async execute(request: RecordConsentRequest): Promise<RecordConsentResponse> {
    const existing = await this.consentRepository.findBySessionId(request.sessionId);
    if (existing) {
      return { consent: existing.toSnapshot() };
    }

    const consent = Consent.create({
      sessionId: request.sessionId,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      policyVersion: request.policyVersion,
    });

    const persisted = await this.consentRepository.create(consent);
    return { consent: persisted.toSnapshot() };
  }
}
