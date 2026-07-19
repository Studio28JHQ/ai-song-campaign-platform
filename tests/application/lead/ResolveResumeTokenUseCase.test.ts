import { beforeEach, describe, expect, it } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { ResolveResumeTokenUseCase } from "@/application/lead/use-cases/ResolveResumeTokenUseCase";

class InMemoryLeadRepository implements LeadRepository {
  private readonly leads = new Map<string, Lead>();
  seed(lead: Lead): void {
    this.leads.set(lead.id, lead);
  }
  async findById(id: string): Promise<Lead | null> {
    return this.leads.get(id) ?? null;
  }
  async findByEmail(email: Email): Promise<Lead | null> {
    for (const lead of this.leads.values()) if (lead.email.equals(email)) return lead;
    return null;
  }
  async findByResumeToken(token: string): Promise<Lead | null> {
    for (const lead of this.leads.values()) if (lead.resumeToken === token) return lead;
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

class InMemoryLyricsRepository implements LyricsRepository {
  private readonly records = new Map<string, Lyrics>();
  seed(lyrics: Lyrics): void {
    this.records.set(lyrics.id, lyrics);
  }
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

function buildLead(): Lead {
  return Lead.create(
    {
      campaignId: "campaign-1",
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      email: "jane@example.com",
    },
    5,
  );
}

function buildApprovedLyrics(leadId: string): Lyrics {
  const lyrics = Lyrics.create({
    leadId,
    moodId: "mood-1",
    prompt: "prompt",
    content: "Title\nVerse 1",
    version: 1,
    parentMessage: "A gentle song about bedtime.",
    musicMood: "Warm, joyful and playful.",
    musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
    voice: "FEMALE",
  });
  lyrics.approve();
  return lyrics;
}

describe("ResolveResumeTokenUseCase", () => {
  let leadRepository: InMemoryLeadRepository;
  let lyricsRepository: InMemoryLyricsRepository;
  let useCase: ResolveResumeTokenUseCase;

  beforeEach(() => {
    leadRepository = new InMemoryLeadRepository();
    lyricsRepository = new InMemoryLyricsRepository();
    useCase = new ResolveResumeTokenUseCase(leadRepository, lyricsRepository);
  });

  it("rejects an unknown token without revealing why", async () => {
    await expect(useCase.execute({ token: "does-not-exist" })).rejects.toMatchObject({
      code: "lead.resume_token_invalid",
    });
  });

  it("resolves to /generate when the lead has no lyrics yet", async () => {
    const lead = buildLead();
    leadRepository.seed(lead);

    const result = await useCase.execute({ token: lead.resumeToken });

    expect(result).toEqual({ leadId: lead.id, destination: "generate" });
  });

  it("resolves to /generate when lyrics exist but are not yet approved (awaiting approval)", async () => {
    const lead = buildLead();
    leadRepository.seed(lead);
    lyricsRepository.seed(
      Lyrics.create({
        leadId: lead.id,
        moodId: "mood-1",
        prompt: "prompt",
        content: "Title\nVerse 1",
        version: 1,
        parentMessage: "A gentle song about bedtime.",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
        voice: "FEMALE",
      }),
    );

    const result = await useCase.execute({ token: lead.resumeToken });

    expect(result.destination).toBe("generate");
  });

  it("resolves to /song once lyrics are approved, regardless of the song's own status", async () => {
    const lead = buildLead();
    leadRepository.seed(lead);
    lyricsRepository.seed(buildApprovedLyrics(lead.id));

    const result = await useCase.execute({ token: lead.resumeToken });

    expect(result).toEqual({ leadId: lead.id, destination: "song" });
  });

  it("is reusable — resolving the same token twice always returns a fresh, current result", async () => {
    const lead = buildLead();
    leadRepository.seed(lead);

    const first = await useCase.execute({ token: lead.resumeToken });
    expect(first.destination).toBe("generate");

    lyricsRepository.seed(buildApprovedLyrics(lead.id));

    const second = await useCase.execute({ token: lead.resumeToken });
    expect(second.destination).toBe("song");
  });
});
