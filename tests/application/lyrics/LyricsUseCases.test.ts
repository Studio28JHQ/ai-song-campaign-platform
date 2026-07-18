import { beforeEach, describe, expect, it } from "vitest";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { GenerateLyricsUseCase } from "@/application/lyrics/use-cases/GenerateLyricsUseCase";
import { ApproveLyricsUseCase } from "@/application/lyrics/use-cases/ApproveLyricsUseCase";
import type { GenerateLyricsRequest } from "@/application/lyrics/dto/GenerateLyricsRequest";

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

const baseRequest: GenerateLyricsRequest = {
  leadId: "lead-1",
  moodId: "mood-1",
  prompt: "a joyful lullaby prompt",
  content: "generated lyrics content",
  parentMessage: "A gentle song about bedtime.",
  musicMood: "Warm, joyful and playful.",
  musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
  voice: "FEMALE",
};

describe("GenerateLyricsUseCase", () => {
  let repository: InMemoryLyricsRepository;
  let useCase: GenerateLyricsUseCase;

  beforeEach(() => {
    repository = new InMemoryLyricsRepository();
    useCase = new GenerateLyricsUseCase(repository);
  });

  it("creates the first version for a lead", async () => {
    const response = await useCase.execute(baseRequest);
    expect(response.lyrics.version).toBe(1);
    expect(response.lyrics.approved).toBe(false);
  });

  it("increments the version for each subsequent generation", async () => {
    await useCase.execute(baseRequest);
    await useCase.execute(baseRequest);
    const third = await useCase.execute(baseRequest);

    expect(third.lyrics.version).toBe(3);
  });

  it("numbers versions independently per lead", async () => {
    await useCase.execute(baseRequest);
    const otherLead = await useCase.execute({ ...baseRequest, leadId: "lead-2" });

    expect(otherLead.lyrics.version).toBe(1);
  });
});

describe("ApproveLyricsUseCase", () => {
  let repository: InMemoryLyricsRepository;
  let generate: GenerateLyricsUseCase;
  let approve: ApproveLyricsUseCase;

  beforeEach(() => {
    repository = new InMemoryLyricsRepository();
    generate = new GenerateLyricsUseCase(repository);
    approve = new ApproveLyricsUseCase(repository);
  });

  it("approves an existing lyrics version", async () => {
    const created = await generate.execute(baseRequest);
    const response = await approve.execute({ lyricsId: created.lyrics.id });
    expect(response.lyrics.approved).toBe(true);
  });

  it("rejects approving a non-existent lyrics id", async () => {
    await expect(approve.execute({ lyricsId: "missing" })).rejects.toThrow();
  });

  it("rejects approving a second version for the same lead", async () => {
    const first = await generate.execute(baseRequest);
    const second = await generate.execute(baseRequest);

    await approve.execute({ lyricsId: first.lyrics.id });

    await expect(approve.execute({ lyricsId: second.lyrics.id })).rejects.toThrow();
  });

  it("allows approving versions for different leads independently", async () => {
    const leadOne = await generate.execute(baseRequest);
    const leadTwo = await generate.execute({ ...baseRequest, leadId: "lead-2" });

    await approve.execute({ lyricsId: leadOne.lyrics.id });
    const response = await approve.execute({ lyricsId: leadTwo.lyrics.id });

    expect(response.lyrics.approved).toBe(true);
  });
});
