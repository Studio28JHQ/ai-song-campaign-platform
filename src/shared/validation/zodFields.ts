import { z } from "zod";
import { isValidEmailFormat } from "./email";
import { isValidPhoneFormat } from "./phone";
import { describeTextValidationFailure, FIELD_LIMITS, sanitizePlainText } from "./text";

/**
 * Zod schema builders shared by the frontend forms and the API route
 * schemas (Sprint 8.1) — the only place these rules are expressed, so
 * both layers stay in lockstep. Domain/application code does not import
 * this file; it uses the framework-agnostic functions in `./text`,
 * `./email`, and `./phone` directly.
 */

/** Required plain-text field: applies every Sprint 8.1 hardening rule. */
export function plainTextField(fieldLabel: string, maxLength: number) {
  return z.string().transform((raw, ctx) => {
    const result = sanitizePlainText(raw, maxLength);
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        message: describeTextValidationFailure(fieldLabel, result.reason, maxLength),
      });
      return z.NEVER;
    }
    return result.value;
  });
}

/** Optional plain-text field: blank/omitted collapses to `undefined`; anything else is fully validated. */
export function optionalPlainTextField(fieldLabel: string, maxLength: number) {
  return z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim().length === 0) {
        return undefined;
      }

      const result = sanitizePlainText(raw, maxLength);
      if (!result.ok) {
        ctx.addIssue({
          code: "custom",
          message: describeTextValidationFailure(fieldLabel, result.reason, maxLength),
        });
        return z.NEVER;
      }
      return result.value;
    });
}

/** Email field: Sprint 8.1 hardening plus RFC-shaped format validation. */
export function emailField() {
  return plainTextField("Email", FIELD_LIMITS.email).transform((value, ctx) => {
    const normalized = value.toLowerCase();
    if (!isValidEmailFormat(normalized)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid email address." });
      return z.NEVER;
    }
    return normalized;
  });
}

/** Optional phone field: Sprint 8.1 hardening plus international-number format validation. */
export function optionalPhoneField() {
  return optionalPlainTextField("Phone", FIELD_LIMITS.phone).transform((value, ctx) => {
    if (value === undefined) {
      return undefined;
    }
    if (!isValidPhoneFormat(value)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
      return z.NEVER;
    }
    return value;
  });
}
