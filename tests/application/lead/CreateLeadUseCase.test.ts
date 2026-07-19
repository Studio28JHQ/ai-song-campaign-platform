import { beforeEach, describe, expect, it } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import { LeadStatus } from "@/domain/lead/types";
import type { Email } from "@/domain/lead/value-objects/Email";
import { CreateLeadUseCase } from "@/application/lead/use-cases/CreateLeadUseCase";
import type { LeadCampaignConfig } from "@/application/lead/contracts/LeadCampaignConfig";
import type { CreateLeadRequest } from "@/application/lead/dto/CreateLeadRequest";

class InMemoryLeadRepository implements LeadRepository {
  private readonly leads = new Map<string, Lead>();

  async findById(id: string): Promise<Lead | null> {
    return this.leads.get(id) ?? null;
  }

  async findByEmail(email: Email): Promise<Lead | null> {
    for (const lead of this.leads.values()) {
      if (lead.email.equals(email)) return lead;
    }
    return null;
  }

  async findByResumeToken(token: string): Promise<Lead | null> {
    for (const lead of this.leads.values()) {
      if (lead.resumeToken === token) return lead;
    }
    return null;
  }

  async existsByEmail(email: Email): Promise<boolean> {
    return (await this.findByEmail(email)) !== null;
  }

  async create(lead: Lead): Promise<Lead> {
    this.leads.set(lead.id, lead);
    return lead;
  }

  async update(lead: Lead): Promise<Lead> {
    this.leads.set(lead.id, lead);
    return lead;
  }
  async updateAttemptConsumption(
    lead: Lead,
    expectedRemainingAttempts: number,
  ): Promise<Lead | null> {
    const existing = this.leads.get(lead.id);
    if (!existing || existing.remainingAttempts !== expectedRemainingAttempts) {
      return null;
    }
    this.leads.set(lead.id, lead);
    return lead;
  }
}

class FixedCampaignConfig implements LeadCampaignConfig {
  constructor(private readonly maxLyricAttempts: number) {}

  getMaxLyricAttempts(): number {
    return this.maxLyricAttempts;
  }
}

const validRequest: CreateLeadRequest = {
  campaignId: "campaign-1",
  parentName: "Jane Doe",
  babyName: "Baby Doe",
  email: "jane@example.com",
};

describe("CreateLeadUseCase", () => {
  let repository: InMemoryLeadRepository;
  let useCase: CreateLeadUseCase;

  beforeEach(() => {
    repository = new InMemoryLeadRepository();
    useCase = new CreateLeadUseCase(repository, new FixedCampaignConfig(5));
  });

  it("creates a registered lead with attempts from configuration", async () => {
    const response = await useCase.execute(validRequest);

    expect(response.lead.status).toBe(LeadStatus.REGISTERED);
    expect(response.lead.remainingAttempts).toBe(5);
    expect(response.lead.email).toBe("jane@example.com");
  });

  it("initializes remainingAttempts from the injected campaign config, not a hardcoded value", async () => {
    useCase = new CreateLeadUseCase(repository, new FixedCampaignConfig(3));

    const response = await useCase.execute(validRequest);

    expect(response.lead.remainingAttempts).toBe(3);
  });

  it("persists the created lead through the repository", async () => {
    const response = await useCase.execute(validRequest);

    const persisted = await repository.findById(response.lead.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.email.toString()).toBe("jane@example.com");
  });

  it("rejects a second registration with the same email", async () => {
    await useCase.execute(validRequest);

    await expect(useCase.execute(validRequest)).rejects.toThrow();
  });

  it("rejects an invalid email before touching the repository", async () => {
    await expect(useCase.execute({ ...validRequest, email: "not-an-email" })).rejects.toThrow();

    expect(await repository.findByEmail(Lead.create(validRequest, 5).email)).toBeNull();
  });

  it("rejects a missing parent name", async () => {
    await expect(useCase.execute({ ...validRequest, parentName: "" })).rejects.toThrow();
  });
});
