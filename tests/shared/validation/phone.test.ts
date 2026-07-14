import { describe, expect, it } from "vitest";
import { isValidPhoneFormat } from "@/shared/validation/phone";

describe("isValidPhoneFormat", () => {
  it.each(["+1 (555) 123-4567", "+44 20 7946 0958", "+81-3-1234-5678", "5551234567"])(
    "accepts the plausible international number %s",
    (value) => {
      expect(isValidPhoneFormat(value)).toBe(true);
    },
  );

  it.each([
    "123",
    "not-a-phone",
    "",
    "-------",
    "+1 234 567 890 123 456 789", // too many digits for E.164
  ])("rejects the malformed number %s", (value) => {
    expect(isValidPhoneFormat(value)).toBe(false);
  });
});
