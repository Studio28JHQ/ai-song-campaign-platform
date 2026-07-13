import { describe, expect, it } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import { LeadStatus as DomainLeadStatus } from "@/domain/lead/types";
import { LeadMapper } from "@/infrastructure/persistence/prisma/lead/LeadMapper";
import type { Lead as PrismaLeadRecord } from "@/generated/prisma/client";
import { LeadStatus as PrismaLeadStatus } from "@/generated/prisma/client";

function buildRecord(overrides: Partial<PrismaLeadRecord> = {}): PrismaLeadRecord {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "11111111-1111-1111-1111-111111111111",
    campaignId: "22222222-2222-2222-2222-222222222222",
    parentName: "Jane Doe",
    babyName: "Baby Doe",
    babyAge: null,
    city: null,
    email: "jane@example.com",
    phone: null,
    remainingAttempts: 5,
    status: PrismaLeadStatus.REGISTERED,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("LeadMapper.toDomain", () => {
  it("maps a persisted record into a Lead entity", () => {
    const lead = LeadMapper.toDomain(buildRecord());

    expect(lead.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(lead.email.toString()).toBe("jane@example.com");
    expect(lead.status).toBe(DomainLeadStatus.REGISTERED);
  });

  it.each([
    [PrismaLeadStatus.MODERATION_REJECTED, DomainLeadStatus.GENERATING],
    [PrismaLeadStatus.LYRICS_GENERATED, DomainLeadStatus.GENERATING],
    [PrismaLeadStatus.LYRICS_APPROVED, DomainLeadStatus.GENERATING],
    [PrismaLeadStatus.SONG_GENERATING, DomainLeadStatus.GENERATING],
    [PrismaLeadStatus.SONG_READY, DomainLeadStatus.GENERATING],
    [PrismaLeadStatus.COMPLETED, DomainLeadStatus.COMPLETED],
    [PrismaLeadStatus.ATTEMPTS_EXHAUSTED, DomainLeadStatus.BLOCKED],
  ])("collapses persistence status %s to domain status %s", (persistenceStatus, domainStatus) => {
    const lead = LeadMapper.toDomain(buildRecord({ status: persistenceStatus }));
    expect(lead.status).toBe(domainStatus);
  });
});

describe("LeadMapper.toCreateInput / toUpdateInput", () => {
  it("produces a create input with the mapped persistence status", () => {
    const lead = Lead.create(
      {
        campaignId: "campaign-1",
        parentName: "Jane Doe",
        babyName: "Baby Doe",
        email: "jane@example.com",
      },
      5,
    );

    const input = LeadMapper.toCreateInput(lead);

    expect(input.id).toBe(lead.id);
    expect(input.email).toBe("jane@example.com");
    expect(input.status).toBe(PrismaLeadStatus.REGISTERED);
  });

  it("throws when trying to persist a FAILED lead (no schema equivalent yet)", () => {
    const lead = Lead.create(
      {
        campaignId: "campaign-1",
        parentName: "Jane Doe",
        babyName: "Baby Doe",
        email: "jane@example.com",
      },
      5,
    );
    lead.startGenerating();
    lead.fail();

    expect(() => LeadMapper.toCreateInput(lead)).toThrow();
    expect(() => LeadMapper.toUpdateInput(lead)).toThrow();
  });
});
