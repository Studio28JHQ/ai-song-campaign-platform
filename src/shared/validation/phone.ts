const PHONE_CHAR_PATTERN = /^[+]?[0-9()\-.\s]+$/;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15; // E.164 maximum

/**
 * Accepts plausible international phone numbers (digits plus `+`, spaces,
 * dashes, dots, parentheses) and rejects obviously malformed input by
 * bounding the digit count against E.164 — this is a shape check, not
 * carrier/reachability verification.
 */
export function isValidPhoneFormat(value: string): boolean {
  if (!PHONE_CHAR_PATTERN.test(value)) {
    return false;
  }

  const digitCount = value.replace(/\D/g, "").length;
  return digitCount >= MIN_PHONE_DIGITS && digitCount <= MAX_PHONE_DIGITS;
}
