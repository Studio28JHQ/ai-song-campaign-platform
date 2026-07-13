import { describe, expect, it } from "vitest";
import { BabyAge } from "@/domain/lead/value-objects/BabyAge";
import { Email } from "@/domain/lead/value-objects/Email";
import { PhoneNumber } from "@/domain/lead/value-objects/PhoneNumber";

describe("Email", () => {
  it("accepts a valid email and normalizes case/whitespace", () => {
    const email = Email.create("  Jane@Example.com  ");
    expect(email.toString()).toBe("jane@example.com");
  });

  it.each(["not-an-email", "missing-domain@", "@missing-local.com", ""])(
    "rejects invalid email %s",
    (raw) => {
      expect(() => Email.create(raw)).toThrow();
    },
  );
});

describe("PhoneNumber", () => {
  it("accepts a plausible phone number", () => {
    const phone = PhoneNumber.create("+1 (555) 123-4567");
    expect(phone.toString()).toBe("+1 (555) 123-4567");
  });

  it.each(["123", "not-a-phone", ""])("rejects invalid phone number %s", (raw) => {
    expect(() => PhoneNumber.create(raw)).toThrow();
  });
});

describe("BabyAge", () => {
  it("accepts a valid age in months", () => {
    expect(BabyAge.create(6).value).toBe(6);
  });

  it.each([-1, 1.5, 300])("rejects invalid age in months %s", (months) => {
    expect(() => BabyAge.create(months)).toThrow();
  });
});
