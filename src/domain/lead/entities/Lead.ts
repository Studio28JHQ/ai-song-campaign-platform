import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  describeTextValidationFailure,
  FIELD_LIMITS,
  sanitizePlainText,
} from "@/shared/validation/text";
import { BabyAge } from "../value-objects/BabyAge";
import { Email } from "../value-objects/Email";
import { PhoneNumber } from "../value-objects/PhoneNumber";
import { LeadStatus, type CreateLeadInput, type LeadProps, type LeadSnapshot } from "../types";

const ALLOWED_TRANSITIONS: Record<LeadStatus, ReadonlyArray<LeadStatus>> = {
  [LeadStatus.REGISTERED]: [LeadStatus.GENERATING],
  [LeadStatus.GENERATING]: [LeadStatus.COMPLETED, LeadStatus.BLOCKED, LeadStatus.FAILED],
  [LeadStatus.COMPLETED]: [],
  [LeadStatus.BLOCKED]: [],
  [LeadStatus.FAILED]: [],
};

/**
 * Aggregate root for a campaign participant. Encapsulates the invariants
 * from docs/Product/Business_Rules.md: mandatory identity fields, a
 * non-negative/bounded lyric-attempt budget, and an explicit lifecycle.
 * No persistence, no framework dependency — see `LeadRepository` for the
 * (unimplemented) persistence contract.
 */
export class Lead {
  private constructor(private props: LeadProps) {}

  /** Registers a new lead. `maxAttempts` comes from the active Campaign (not stored on Lead itself). */
  static create(input: CreateLeadInput, maxAttempts: number): Lead {
    if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
      throw new BusinessRuleError("Campaign maximum attempts must be a positive integer.", {
        code: "lead.invalid_max_attempts",
        context: { maxAttempts },
      });
    }

    const campaignId = Lead.requireNonEmpty(input.campaignId, "campaignId");
    const parentName = Lead.sanitizeRequiredField(
      input.parentName,
      "Parent name",
      FIELD_LIMITS.parentName,
      "parentName",
    );
    const babyName = Lead.sanitizeRequiredField(
      input.babyName,
      "Baby name",
      FIELD_LIMITS.babyName,
      "babyName",
    );
    const email = Email.create(input.email);
    const phone = input.phone ? PhoneNumber.create(input.phone) : null;
    const babyAge = input.babyAge !== undefined ? BabyAge.create(input.babyAge) : null;
    const city = Lead.sanitizeOptionalField(input.city, "City", FIELD_LIMITS.city, "city");
    const now = new Date();

    return new Lead({
      id: crypto.randomUUID(),
      campaignId,
      parentName,
      babyName,
      babyAge,
      city,
      email,
      phone,
      remainingAttempts: maxAttempts,
      status: LeadStatus.REGISTERED,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Rehydrates a Lead from already-persisted state (used by a future
   * repository implementation). `maxAttempts` is optional here since the
   * caller may not always have the campaign's ceiling on hand; when
   * provided, the ceiling invariant is still enforced.
   */
  static fromPersistence(props: LeadProps, maxAttempts?: number): Lead {
    Lead.assertAttemptsInvariant(props.remainingAttempts, maxAttempts);
    return new Lead({ ...props });
  }

  private static requireNonEmpty(value: string, field: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new ValidationError(`${field} is required.`, {
        code: `lead.${field}_required`,
      });
    }
    return trimmed;
  }

  /** Sprint 8.1 input hardening for required plain-text fields — see `@/shared/validation`. */
  private static sanitizeRequiredField(
    value: string,
    fieldLabel: string,
    maxLength: number,
    code: string,
  ): string {
    const result = sanitizePlainText(value, maxLength);
    if (!result.ok) {
      throw new ValidationError(
        describeTextValidationFailure(fieldLabel, result.reason, maxLength),
        {
          code: `lead.invalid_${code}`,
        },
      );
    }
    return result.value;
  }

  /** Same hardening as `sanitizeRequiredField`, but a blank/omitted value collapses to `null`. */
  private static sanitizeOptionalField(
    value: string | undefined,
    fieldLabel: string,
    maxLength: number,
    code: string,
  ): string | null {
    if (value === undefined || value.trim().length === 0) {
      return null;
    }

    return Lead.sanitizeRequiredField(value, fieldLabel, maxLength, code);
  }

  private static assertAttemptsInvariant(remainingAttempts: number, maxAttempts?: number): void {
    if (!Number.isInteger(remainingAttempts) || remainingAttempts < 0) {
      throw new BusinessRuleError("Remaining attempts cannot be negative.", {
        code: "lead.negative_remaining_attempts",
        context: { remainingAttempts },
      });
    }

    if (maxAttempts !== undefined && remainingAttempts > maxAttempts) {
      throw new BusinessRuleError("Remaining attempts cannot exceed the campaign maximum.", {
        code: "lead.remaining_attempts_exceeds_maximum",
        context: { remainingAttempts, maxAttempts },
      });
    }
  }

  private assertCanTransitionTo(next: LeadStatus): void {
    const allowed = ALLOWED_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new BusinessRuleError(`Lead cannot transition from ${this.props.status} to ${next}.`, {
        code: "lead.invalid_status_transition",
        context: { from: this.props.status, to: next },
      });
    }
  }

  private transitionTo(next: LeadStatus): void {
    this.assertCanTransitionTo(next);
    this.props.status = next;
    this.props.updatedAt = new Date();
  }

  /** Moves the lead into the active generation pipeline (moderation → lyrics → song). */
  startGenerating(): void {
    this.transitionTo(LeadStatus.GENERATING);
  }

  /** Marks the lead's journey finished — a song was generated and delivered. */
  complete(): void {
    this.transitionTo(LeadStatus.COMPLETED);
  }

  /** Marks the lead as unable to proceed (e.g. attempts exhausted). Terminal. */
  block(): void {
    this.transitionTo(LeadStatus.BLOCKED);
  }

  /** Marks the lead as failed due to an unrecoverable error. Terminal. */
  fail(): void {
    this.transitionTo(LeadStatus.FAILED);
  }

  /**
   * Consumes one lyric attempt. Only valid while generating (see
   * docs/Product/Business_Rules.md — Attempts Rules); automatically
   * blocks the lead once the budget is exhausted so that invariant can
   * never be forgotten by a caller.
   */
  consumeAttempt(): void {
    if (this.props.status !== LeadStatus.GENERATING) {
      throw new BusinessRuleError("Attempts can only be consumed while the lead is generating.", {
        code: "lead.attempt_consumption_invalid_state",
        context: { status: this.props.status },
      });
    }

    if (this.props.remainingAttempts <= 0) {
      throw new BusinessRuleError("No remaining attempts left to consume.", {
        code: "lead.no_remaining_attempts",
        context: { leadId: this.props.id },
      });
    }

    this.props.remainingAttempts -= 1;
    this.props.updatedAt = new Date();

    if (this.props.remainingAttempts === 0) {
      this.block();
    }
  }

  get id(): string {
    return this.props.id;
  }

  get campaignId(): string {
    return this.props.campaignId;
  }

  get parentName(): string {
    return this.props.parentName;
  }

  get babyName(): string {
    return this.props.babyName;
  }

  get babyAge(): BabyAge | null {
    return this.props.babyAge;
  }

  get city(): string | null {
    return this.props.city;
  }

  get email(): Email {
    return this.props.email;
  }

  get phone(): PhoneNumber | null {
    return this.props.phone;
  }

  get remainingAttempts(): number {
    return this.props.remainingAttempts;
  }

  get status(): LeadStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  toSnapshot(): LeadSnapshot {
    return {
      id: this.props.id,
      campaignId: this.props.campaignId,
      parentName: this.props.parentName,
      babyName: this.props.babyName,
      babyAge: this.props.babyAge?.value ?? null,
      city: this.props.city,
      email: this.props.email.toString(),
      phone: this.props.phone?.toString() ?? null,
      remainingAttempts: this.props.remainingAttempts,
      status: this.props.status,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}
