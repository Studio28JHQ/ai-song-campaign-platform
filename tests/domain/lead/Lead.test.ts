import { describe, expect, it } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import { LeadStatus, type CreateLeadInput } from "@/domain/lead/types";

const validInput: CreateLeadInput = {
  campaignId: "campaign-1",
  parentName: "Jane Doe",
  babyName: "Baby Doe",
  email: "jane@example.com",
};

describe("Lead.create", () => {
  it("creates a registered lead with the campaign's max attempts", () => {
    const lead = Lead.create(validInput, 5);

    expect(lead.status).toBe(LeadStatus.REGISTERED);
    expect(lead.remainingAttempts).toBe(5);
    expect(lead.email.toString()).toBe("jane@example.com");
    expect(lead.id).toBeTruthy();
  });

  it("rejects a missing parent name", () => {
    expect(() => Lead.create({ ...validInput, parentName: "  " }, 5)).toThrow();
  });

  it("rejects a missing baby name", () => {
    expect(() => Lead.create({ ...validInput, babyName: "" }, 5)).toThrow();
  });

  it("rejects an invalid email format", () => {
    expect(() => Lead.create({ ...validInput, email: "not-an-email" }, 5)).toThrow();
  });

  it("rejects a non-positive campaign max attempts", () => {
    expect(() => Lead.create(validInput, 0)).toThrow();
  });
});

describe("Lead status transitions", () => {
  it("allows REGISTERED -> GENERATING -> COMPLETED", () => {
    const lead = Lead.create(validInput, 5);
    lead.startGenerating();
    expect(lead.status).toBe(LeadStatus.GENERATING);
    lead.complete();
    expect(lead.status).toBe(LeadStatus.COMPLETED);
  });

  it("rejects skipping straight to COMPLETED", () => {
    const lead = Lead.create(validInput, 5);
    expect(() => lead.complete()).toThrow();
  });

  it("rejects transitions out of a terminal state", () => {
    const lead = Lead.create(validInput, 5);
    lead.startGenerating();
    lead.fail();
    expect(() => lead.startGenerating()).toThrow();
  });
});

describe("Lead.consumeAttempt", () => {
  it("decrements remaining attempts while generating", () => {
    const lead = Lead.create(validInput, 5);
    lead.startGenerating();
    lead.consumeAttempt();
    expect(lead.remainingAttempts).toBe(4);
    expect(lead.status).toBe(LeadStatus.GENERATING);
  });

  it("auto-blocks once attempts reach zero", () => {
    const lead = Lead.create(validInput, 1);
    lead.startGenerating();
    lead.consumeAttempt();
    expect(lead.remainingAttempts).toBe(0);
    expect(lead.status).toBe(LeadStatus.BLOCKED);
  });

  it("rejects consuming an attempt outside the GENERATING state", () => {
    const lead = Lead.create(validInput, 5);
    expect(() => lead.consumeAttempt()).toThrow();
  });

  it("never allows remaining attempts to go negative", () => {
    const lead = Lead.create(validInput, 1);
    lead.startGenerating();
    lead.consumeAttempt();
    expect(() => lead.consumeAttempt()).toThrow();
    expect(lead.remainingAttempts).toBe(0);
  });
});

describe("Lead.fromPersistence", () => {
  it("rehydrates valid persisted state", () => {
    const created = Lead.create(validInput, 5);
    const rehydrated = Lead.fromPersistence(
      {
        id: created.id,
        campaignId: created.campaignId,
        parentName: created.parentName,
        babyName: created.babyName,
        babyAge: created.babyAge,
        city: created.city,
        email: created.email,
        phone: created.phone,
        remainingAttempts: created.remainingAttempts,
        status: created.status,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
      5,
    );

    expect(rehydrated.id).toBe(created.id);
  });

  it("rejects negative remaining attempts", () => {
    const created = Lead.create(validInput, 5);
    expect(() =>
      Lead.fromPersistence({
        id: created.id,
        campaignId: created.campaignId,
        parentName: created.parentName,
        babyName: created.babyName,
        babyAge: created.babyAge,
        city: created.city,
        email: created.email,
        phone: created.phone,
        remainingAttempts: -1,
        status: created.status,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      }),
    ).toThrow();
  });

  it("rejects remaining attempts exceeding the provided campaign maximum", () => {
    const created = Lead.create(validInput, 5);
    expect(() =>
      Lead.fromPersistence(
        {
          id: created.id,
          campaignId: created.campaignId,
          parentName: created.parentName,
          babyName: created.babyName,
          babyAge: created.babyAge,
          city: created.city,
          email: created.email,
          phone: created.phone,
          remainingAttempts: 5,
          status: created.status,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        3,
      ),
    ).toThrow();
  });
});
