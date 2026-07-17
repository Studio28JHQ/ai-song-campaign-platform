import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import { LeadStatus } from "@/domain/lead/types";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { GenerateLyricsForLeadUseCase } from "@/application/lyrics/use-cases/GenerateLyricsForLeadUseCase";
import type {
  LyricsGenerator,
  LyricsGeneratorResult,
} from "@/application/lyrics/contracts/LyricsGenerator";
import type { GenerateLyricsForLeadRequest } from "@/application/lyrics/dto/GenerateLyricsForLeadRequest";

class InMemoryLeadRepository implements LeadRepository {
  private readonly leads = new Map<string, Lead>();
  /**
   * `Lead` is mutated in place before a repository write ever happens
   * (`consumeAttempt()` runs before `updateAttemptConsumption()` is
   * called), so comparing against `leads.get(id).remainingAttempts`
   * inside `updateAttemptConsumption` would see the caller's own
   * not-yet-persisted mutation, not the last *persisted* value —
   * defeating the whole point of the conditional update. This tracks
   * `remainingAttempts` as of the last successful write, independent of
   * the live (shared-reference) `Lead` object's current in-memory state.
   */
  private readonly persistedRemainingAttempts = new Map<string, number>();

  seed(lead: Lead): void {
    this.leads.set(lead.id, lead);
    this.persistedRemainingAttempts.set(lead.id, lead.remainingAttempts);
  }

  async findById(id: string): Promise<Lead | null> {
    return this.leads.get(id) ?? null;
  }

  async findByEmail(email: Email): Promise<Lead | null> {
    for (const lead of this.leads.values()) {
      if (lead.email.equals(email)) return lead;
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
    this.persistedRemainingAttempts.set(lead.id, lead.remainingAttempts);
    return lead;
  }
  async updateAttemptConsumption(
    lead: Lead,
    expectedRemainingAttempts: number,
  ): Promise<Lead | null> {
    if (this.persistedRemainingAttempts.get(lead.id) !== expectedRemainingAttempts) {
      return null;
    }
    this.leads.set(lead.id, lead);
    this.persistedRemainingAttempts.set(lead.id, lead.remainingAttempts);
    return lead;
  }
}

class InMemoryLyricsRepository implements LyricsRepository {
  private readonly records = new Map<string, Lyrics>();

  async create(lyrics: Lyrics): Promise<Lyrics> {
    this.records.set(lyrics.id, lyrics);
    return lyrics;
  }

  async findById(id: string): Promise<Lyrics | null> {
    return this.records.get(id) ?? null;
  }

  async findAllByLead(leadId: string): Promise<Lyrics[]> {
    return [...this.records.values()].filter((lyrics) => lyrics.leadId === leadId);
  }

  async findApprovedByLead(leadId: string): Promise<Lyrics | null> {
    return (
      [...this.records.values()].find((lyrics) => lyrics.leadId === leadId && lyrics.approved) ??
      null
    );
  }

  async approve(lyrics: Lyrics): Promise<Lyrics> {
    this.records.set(lyrics.id, lyrics);
    return lyrics;
  }

  async reject(lyrics: Lyrics): Promise<Lyrics> {
    this.records.set(lyrics.id, lyrics);
    return lyrics;
  }
}

function fakeGenerator(result: LyricsGeneratorResult): LyricsGenerator {
  return { generateAndModerate: vi.fn().mockResolvedValue(result) };
}

function createLead(maxAttempts = 5): Lead {
  return Lead.create(
    {
      campaignId: "campaign-1",
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      email: "jane@example.com",
    },
    maxAttempts,
  );
}

const baseRequest: Omit<GenerateLyricsForLeadRequest, "leadId"> = {
  moodId: "mood-1",
  moodName: "Joyful",
  moodDescription: "upbeat and cheerful",
  parentMessage: "A gentle song about bedtime.",
};

describe("GenerateLyricsForLeadUseCase", () => {
  let leadRepository: InMemoryLeadRepository;
  let lyricsRepository: InMemoryLyricsRepository;

  beforeEach(() => {
    leadRepository = new InMemoryLeadRepository();
    lyricsRepository = new InMemoryLyricsRepository();
  });

  it("rejects an unknown lead", async () => {
    const useCase = new GenerateLyricsForLeadUseCase(
      leadRepository,
      lyricsRepository,
      fakeGenerator({ approved: true, reason: null, lyrics: "Title\n..." }),
    );

    await expect(useCase.execute({ leadId: "missing", ...baseRequest })).rejects.toThrow();
  });

  it("rejects when the lead has no remaining attempts", async () => {
    const lead = createLead(1);
    lead.startGenerating();
    lead.consumeAttempt();
    leadRepository.seed(lead);
    const useCase = new GenerateLyricsForLeadUseCase(
      leadRepository,
      lyricsRepository,
      fakeGenerator({ approved: true, reason: null, lyrics: "Title\n..." }),
    );

    await expect(useCase.execute({ leadId: lead.id, ...baseRequest })).rejects.toThrow();
  });

  it("does not consume an attempt for a first-time approved generation", async () => {
    const lead = createLead(5);
    leadRepository.seed(lead);
    const generator = fakeGenerator({
      approved: true,
      reason: null,
      lyrics: "Title\nVerse 1\n...",
    });
    const useCase = new GenerateLyricsForLeadUseCase(leadRepository, lyricsRepository, generator);

    const response = await useCase.execute({ leadId: lead.id, ...baseRequest });

    expect(response.approved).toBe(true);
    expect(response.lyrics?.version).toBe(1);
    expect(response.remainingAttempts).toBe(5);
    expect(response.leadStatus).toBe(LeadStatus.GENERATING);
    expect(generator.generateAndModerate).toHaveBeenCalledTimes(1);
  });

  it("consumes one attempt when a first-time generation is rejected, and stores no lyrics", async () => {
    const lead = createLead(5);
    leadRepository.seed(lead);
    const generator = fakeGenerator({
      approved: false,
      reason: "Contains offensive language.",
      lyrics: null,
    });
    const useCase = new GenerateLyricsForLeadUseCase(leadRepository, lyricsRepository, generator);

    const response = await useCase.execute({ leadId: lead.id, ...baseRequest });

    expect(response.approved).toBe(false);
    expect(response.lyrics).toBeNull();
    expect(response.reason).toBe("Contains offensive language.");
    expect(response.remainingAttempts).toBe(4);
    expect(await lyricsRepository.findAllByLead(lead.id)).toHaveLength(0);
  });

  it("consumes one attempt for a regeneration, even when approved", async () => {
    const lead = createLead(5);
    leadRepository.seed(lead);
    const useCase = new GenerateLyricsForLeadUseCase(
      leadRepository,
      lyricsRepository,
      fakeGenerator({ approved: true, reason: null, lyrics: "Title\nVerse 1\n..." }),
    );

    const first = await useCase.execute({ leadId: lead.id, ...baseRequest });
    expect(first.remainingAttempts).toBe(5);

    const second = await useCase.execute({ leadId: lead.id, ...baseRequest });
    expect(second.remainingAttempts).toBe(4);
    expect(second.lyrics?.version).toBe(2);

    const versions = await lyricsRepository.findAllByLead(lead.id);
    expect(versions).toHaveLength(2);
  });

  it("preserves previous versions when regenerating", async () => {
    const lead = createLead(5);
    leadRepository.seed(lead);
    const useCase = new GenerateLyricsForLeadUseCase(
      leadRepository,
      lyricsRepository,
      fakeGenerator({ approved: true, reason: null, lyrics: "Title\nVerse 1\n..." }),
    );

    await useCase.execute({ leadId: lead.id, ...baseRequest });
    await useCase.execute({ leadId: lead.id, ...baseRequest });
    await useCase.execute({ leadId: lead.id, ...baseRequest });

    const versions = await lyricsRepository.findAllByLead(lead.id);
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it("blocks the lead once attempts reach zero", async () => {
    const lead = createLead(1);
    leadRepository.seed(lead);
    // First call is free (not a regeneration) and rejected -> consumes the only attempt.
    const useCase = new GenerateLyricsForLeadUseCase(
      leadRepository,
      lyricsRepository,
      fakeGenerator({ approved: false, reason: "not appropriate", lyrics: null }),
    );

    const response = await useCase.execute({ leadId: lead.id, ...baseRequest });

    expect(response.remainingAttempts).toBe(0);
    expect(response.leadStatus).toBe(LeadStatus.BLOCKED);

    const persistedLead = await leadRepository.findById(lead.id);
    expect(persistedLead?.status).toBe(LeadStatus.BLOCKED);
  });

  it("rejects a regeneration when a concurrent request already consumed the attempt (atomic consumption)", async () => {
    const lead = createLead(5);
    leadRepository.seed(lead);
    const consumeSpy = vi.spyOn(leadRepository, "updateAttemptConsumption").mockResolvedValue(null);
    const useCase = new GenerateLyricsForLeadUseCase(
      leadRepository,
      lyricsRepository,
      fakeGenerator({ approved: true, reason: null, lyrics: "Title\nVerse 1\n..." }),
    );

    // Regeneration path always consumes an attempt — force it via a prior version.
    const existing = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\n...",
      version: 1,
    });
    await lyricsRepository.create(existing);

    await expect(useCase.execute({ leadId: lead.id, ...baseRequest })).rejects.toThrow();

    expect(consumeSpy).toHaveBeenCalledTimes(1);
    // No new lyrics version was persisted despite the generator having approved the content.
    expect(await lyricsRepository.findAllByLead(lead.id)).toHaveLength(1);
  });

  it("refuses to generate a new version once the lead already has an approved lyrics version (GATE 6.6)", async () => {
    const lead = createLead(5);
    leadRepository.seed(lead);

    const approved = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\n...",
      version: 1,
    });
    approved.approve();
    await lyricsRepository.create(approved);

    const generator = fakeGenerator({ approved: true, reason: null, lyrics: "Title\nNew\n..." });
    const useCase = new GenerateLyricsForLeadUseCase(leadRepository, lyricsRepository, generator);

    await expect(useCase.execute({ leadId: lead.id, ...baseRequest })).rejects.toThrow();

    // Refused before ever calling Claude, and without consuming an attempt.
    expect(generator.generateAndModerate).not.toHaveBeenCalled();
    const persistedLead = await leadRepository.findById(lead.id);
    expect(persistedLead?.remainingAttempts).toBe(5);
    const versions = await lyricsRepository.findAllByLead(lead.id);
    expect(versions).toHaveLength(1);
  });
});

describe("GenerateLyricsForLeadUseCase — parentMessage hardening (Sprint 8.1)", () => {
  let leadRepository: InMemoryLeadRepository;
  let lyricsRepository: InMemoryLyricsRepository;

  beforeEach(() => {
    leadRepository = new InMemoryLeadRepository();
    lyricsRepository = new InMemoryLyricsRepository();
  });

  it("rejects an HTML/script payload before calling the generator", async () => {
    const lead = createLead(5);
    leadRepository.seed(lead);
    const generator = fakeGenerator({ approved: true, reason: null, lyrics: "Title\n..." });
    const useCase = new GenerateLyricsForLeadUseCase(leadRepository, lyricsRepository, generator);

    await expect(
      useCase.execute({
        leadId: lead.id,
        ...baseRequest,
        parentMessage: "<script>alert(1)</script>",
      }),
    ).rejects.toThrow();

    expect(generator.generateAndModerate).not.toHaveBeenCalled();
  });

  it("rejects a message longer than 600 characters", async () => {
    const lead = createLead(5);
    leadRepository.seed(lead);
    const generator = fakeGenerator({ approved: true, reason: null, lyrics: "Title\n..." });
    const useCase = new GenerateLyricsForLeadUseCase(leadRepository, lyricsRepository, generator);

    await expect(
      useCase.execute({ leadId: lead.id, ...baseRequest, parentMessage: "a".repeat(601) }),
    ).rejects.toThrow();

    expect(generator.generateAndModerate).not.toHaveBeenCalled();
  });

  it("trims and collapses whitespace before passing the message to the generator", async () => {
    const lead = createLead(5);
    leadRepository.seed(lead);
    const generator = fakeGenerator({ approved: true, reason: null, lyrics: "Title\n..." });
    const useCase = new GenerateLyricsForLeadUseCase(leadRepository, lyricsRepository, generator);

    await useCase.execute({
      leadId: lead.id,
      ...baseRequest,
      parentMessage: "  A   gentle    song.  ",
    });

    expect(generator.generateAndModerate).toHaveBeenCalledWith(
      expect.objectContaining({ parentMessage: "A gentle song." }),
    );
  });
});
