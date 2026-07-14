import { ValidationError } from "@/shared/errors";
import { isValidEmailFormat } from "@/shared/validation/email";
import {
  describeTextValidationFailure,
  FIELD_LIMITS,
  sanitizePlainText,
} from "@/shared/validation/text";

/**
 * Structural email validation only — is this string shaped like an email?
 * Uniqueness (one email = one song) and deliverability are infrastructure
 * / application concerns handled elsewhere (repository + future
 * moderation service), not by this value object. Sanitization (trim,
 * collapse whitespace, Unicode normalization, control-character/length
 * limits) is the shared Sprint 8.1 hardening applied to every
 * user-controlled field — see `@/shared/validation`.
 */
export class Email {
  private constructor(private readonly value: string) {}

  static create(raw: string): Email {
    const sanitized = sanitizePlainText(raw, FIELD_LIMITS.email);
    if (!sanitized.ok) {
      throw new ValidationError(
        describeTextValidationFailure("Email", sanitized.reason, FIELD_LIMITS.email),
        { code: "lead.invalid_email_format" },
      );
    }

    const normalized = sanitized.value.toLowerCase();
    if (!isValidEmailFormat(normalized)) {
      throw new ValidationError("Enter a valid email address.", {
        code: "lead.invalid_email_format",
      });
    }

    return new Email(normalized);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
