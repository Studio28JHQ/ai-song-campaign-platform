import { BusinessRuleError, ValidationError } from "@/shared/errors";
import type { ConsentProps, ConsentSnapshot, CreateConsentInput } from "../types";

/**
 * Aggregate root for the Privacy Consent Module. Exactly one Consent
 * exists per first-party `sessionId` — created anonymously (`leadId:
 * null`) the moment a visitor accepts the cookie/privacy banner, before
 * any Lead exists. If the same visitor later completes registration,
 * the existing row is associated with the new Lead (`associateWithLead`)
 * — a Consent is never re-created for a session that already has one;
 * see `RecordConsentUseCase`/`AssociateConsentWithLeadUseCase`.
 */
export class Consent {
  private constructor(private props: ConsentProps) {}

  static create(input: CreateConsentInput): Consent {
    const sessionId = Consent.requireNonEmpty(input.sessionId, "sessionId");
    const ipAddress = Consent.requireNonEmpty(input.ipAddress, "ipAddress");
    const userAgent = Consent.requireNonEmpty(input.userAgent, "userAgent");
    const policyVersion = Consent.requireNonEmpty(input.policyVersion, "policyVersion");
    const now = new Date();

    return new Consent({
      id: crypto.randomUUID(),
      sessionId,
      leadId: null,
      ipAddress,
      userAgent,
      policyVersion,
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Rehydrates a Consent from already-persisted state. */
  static fromPersistence(props: ConsentProps): Consent {
    return new Consent({ ...props });
  }

  private static requireNonEmpty(value: string, field: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new ValidationError(`${field} is required.`, {
        code: `consent.${field}_required`,
      });
    }
    return trimmed;
  }

  /**
   * Associates this (already-persisted, anonymous) Consent with a newly
   * registered Lead — called once, right after registration, keyed by
   * `sessionId`. Idempotent for the same lead (a duplicate call is a
   * no-op); throws if the record is somehow already tied to a
   * *different* lead, since a Consent must never silently switch owners.
   */
  associateWithLead(leadId: string): void {
    const trimmed = Consent.requireNonEmpty(leadId, "leadId");

    if (this.props.leadId === trimmed) {
      return;
    }

    if (this.props.leadId !== null) {
      throw new BusinessRuleError("This consent is already associated with a different lead.", {
        code: "consent.already_associated",
        context: { sessionId: this.props.sessionId, existingLeadId: this.props.leadId },
      });
    }

    this.props.leadId = trimmed;
    this.props.updatedAt = new Date();
  }

  get id(): string {
    return this.props.id;
  }

  get sessionId(): string {
    return this.props.sessionId;
  }

  get leadId(): string | null {
    return this.props.leadId;
  }

  get ipAddress(): string {
    return this.props.ipAddress;
  }

  get userAgent(): string {
    return this.props.userAgent;
  }

  get policyVersion(): string {
    return this.props.policyVersion;
  }

  get acceptedAt(): Date {
    return this.props.acceptedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  toSnapshot(): ConsentSnapshot {
    return { ...this.props };
  }
}
