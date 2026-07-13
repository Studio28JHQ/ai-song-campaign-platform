import { ValidationError } from "@/shared/errors";

const PHONE_FORMAT = /^[+]?[0-9()\-\s]{7,20}$/;

/**
 * Structural phone number validation only — a plausible shape and length.
 * Carrier/reachability verification is out of scope for the domain layer.
 */
export class PhoneNumber {
  private constructor(private readonly value: string) {}

  static create(raw: string): PhoneNumber {
    const trimmed = raw?.trim();

    if (!trimmed || !PHONE_FORMAT.test(trimmed)) {
      throw new ValidationError(`Invalid phone number format: "${raw}".`, {
        code: "lead.invalid_phone_format",
      });
    }

    return new PhoneNumber(trimmed);
  }

  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
