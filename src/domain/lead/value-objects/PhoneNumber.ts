import { ValidationError } from "@/shared/errors";
import { isValidPhoneFormat } from "@/shared/validation/phone";
import {
  describeTextValidationFailure,
  FIELD_LIMITS,
  sanitizePlainText,
} from "@/shared/validation/text";

/**
 * Structural phone number validation only — a plausible shape and length.
 * Carrier/reachability verification is out of scope for the domain layer.
 * Sanitization (trim, collapse whitespace, Unicode normalization,
 * control-character/length limits) is the shared Sprint 8.1 hardening
 * applied to every user-controlled field — see `@/shared/validation`.
 */
export class PhoneNumber {
  private constructor(private readonly value: string) {}

  static create(raw: string): PhoneNumber {
    const sanitized = sanitizePlainText(raw, FIELD_LIMITS.phone);
    if (!sanitized.ok) {
      throw new ValidationError(
        describeTextValidationFailure("Phone", sanitized.reason, FIELD_LIMITS.phone),
        { code: "lead.invalid_phone_format" },
      );
    }

    if (!isValidPhoneFormat(sanitized.value)) {
      throw new ValidationError("Enter a valid phone number.", {
        code: "lead.invalid_phone_format",
      });
    }

    return new PhoneNumber(sanitized.value);
  }

  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
