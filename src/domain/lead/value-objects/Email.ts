import { ValidationError } from "@/shared/errors";

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Structural email validation only — is this string shaped like an email?
 * Uniqueness (one email = one song) and deliverability are infrastructure
 * / application concerns handled elsewhere (repository + future
 * moderation service), not by this value object.
 */
export class Email {
  private constructor(private readonly value: string) {}

  static create(raw: string): Email {
    const trimmed = raw?.trim().toLowerCase();

    if (!trimmed || !EMAIL_FORMAT.test(trimmed)) {
      throw new ValidationError(`Invalid email format: "${raw}".`, {
        code: "lead.invalid_email_format",
      });
    }

    return new Email(trimmed);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
