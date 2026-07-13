import { ValidationError } from "@/shared/errors";

const MIN_AGE_MONTHS = 0;
const MAX_AGE_MONTHS = 216; // generic sanity ceiling (18 years) — not a campaign policy

/**
 * Baby's age in months. The bounds here are a structural sanity check
 * only (reject negative/absurd input); any campaign-specific age policy
 * belongs in `docs/Product/Business_Rules.md`, not this value object.
 */
export class BabyAge {
  private constructor(private readonly months: number) {}

  static create(months: number): BabyAge {
    if (!Number.isInteger(months) || months < MIN_AGE_MONTHS || months > MAX_AGE_MONTHS) {
      throw new ValidationError(`Invalid baby age in months: ${months}.`, {
        code: "lead.invalid_baby_age",
      });
    }

    return new BabyAge(months);
  }

  get value(): number {
    return this.months;
  }

  equals(other: BabyAge): boolean {
    return this.months === other.months;
  }

  toString(): string {
    return String(this.months);
  }
}
