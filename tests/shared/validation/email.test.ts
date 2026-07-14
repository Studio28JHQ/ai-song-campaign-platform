import { describe, expect, it } from "vitest";
import { isValidEmailFormat } from "@/shared/validation/email";

describe("isValidEmailFormat", () => {
  it.each(["jane@example.com", "jane.doe+tag@sub.example.co.uk", "j@x.co"])(
    "accepts %s",
    (value) => {
      expect(isValidEmailFormat(value)).toBe(true);
    },
  );

  it.each([
    "not-an-email",
    "missing-domain@",
    "@missing-local.com",
    "jane@",
    "jane@.com",
    "jane example@example.com",
    "",
  ])("rejects %s", (value) => {
    expect(isValidEmailFormat(value)).toBe(false);
  });
});
