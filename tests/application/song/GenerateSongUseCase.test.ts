import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import { GenerateSongUseCase } from "@/application/song/use-cases/GenerateSongUseCase";
import type { CampaignGate } from "@/application/song/contracts/CampaignGate";

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
    return [...this.records.values()].filter((l) => l.leadId === leadId);
  }
  async findApprovedByLead(leadId: string): Promise<Lyrics | null> {
    return [...this.records.values()].find((l) => l.leadId === leadId && l.approved) ?? null;
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

class InMemorySongRepository implements SongRepository {
  private readonly records = new Map<string, Song>();
  seed(song: Song): void {
    this.records.set(song.id, song);
  }
  async create(song: Song): Promise<Song> {
    this.records.set(song.id, song);
    return song;
  }
  async findById(id: string): Promise<Song | null> {
    return this.records.get(id) ?? null;
  }
  async findByLead(leadId: string): Promise<Song | null> {
    return [...this.records.values()].find((s) => s.leadId === leadId) ?? null;
  }
  async findGenerating(): Promise<Song | null> {
    return [...this.records.values()].find((s) => s.status === SongStatus.GENERATING) ?? null;
  }
  async findOldestQueued(): Promise<Song | null> {
    return (
      [...this.records.values()]
        .filter((s) => s.status === SongStatus.QUEUED)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null
    );
  }
  async update(song: Song): Promise<Song> {
    this.records.set(song.id, song);
    return song;
  }
  async claimQueued(song: Song): Promise<Song | null> {
    const existing = this.records.get(song.id);
    if (!existing || existing.status !== SongStatus.QUEUED) {
      return null;
    }
    this.records.set(song.id, song);
    return song;
  }
}

function fakeCampaignGate(allowed = true): CampaignGate {
  return {
    isActiveAndGenerationEnabled: vi.fn().mockResolvedValue(allowed),
    incrementSongsGenerated: vi.fn().mockResolvedValue(undefined),
  };
}

function createLead(): Lead {
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

function createApprovedLyrics(leadId: string): Lyrics {
  const lyrics = Lyrics.create({
    leadId,
    moodId: "mood-1",
    prompt: "prompt",
    content: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
    version: 1,
  });
  lyrics.approve();
  return lyrics;
}

describe("GenerateSongUseCase", () => {
  let leadRepository: InMemoryLeadRepository;
  let lyricsRepository: InMemoryLyricsRepository;
  let songRepository: InMemorySongRepository;

  beforeEach(() => {
    leadRepository = new InMemoryLeadRepository();
    lyricsRepository = new InMemoryLyricsRepository();
    songRepository = new InMemorySongRepository();
  });

  it("rejects an unknown lead", async () => {
    const useCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
    );

    await expect(useCase.execute({ leadId: "missing" })).rejects.toThrow();
  });

  it("rejects a lead without approved lyrics", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    const useCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
    );

    await expect(useCase.execute({ leadId: lead.id })).rejects.toThrow();
    expect(await songRepository.findByLead(lead.id)).toBeNull();
  });

  it("rejects when the campaign is disabled, before ever checking lyrics", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    const useCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(false),
    );

    await expect(useCase.execute({ leadId: lead.id })).rejects.toThrow();
    expect(await songRepository.findByLead(lead.id)).toBeNull();
  });

  it("persists a new song as QUEUED and returns immediately, without calling the provider", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    const lyrics = createApprovedLyrics(lead.id);
    lyricsRepository.seed(lyrics);
    const useCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
    );

    const response = await useCase.execute({ leadId: lead.id });

    expect(response.song.status).toBe(SongStatus.QUEUED);
    expect(response.song.audioStorageKey).toBeNull();
    expect(response.song.providerSongId).toBeNull();
  });

  it("rejects a second generation once a song is already COMPLETED", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    const lyrics = createApprovedLyrics(lead.id);
    lyricsRepository.seed(lyrics);
    const completedSong = Song.create({
      leadId: lead.id,
      lyricsId: lyrics.id,
      moodId: lyrics.moodId,
    });
    completedSong.markGenerating();
    completedSong.markCompleted({
      providerSongId: "suno-1",
      audioStorageKey: "songs/a.mp3",
    });
    songRepository.seed(completedSong);

    const useCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
    );

    await expect(useCase.execute({ leadId: lead.id })).rejects.toThrow();
  });

  it("reuses the same row for a manual retry after a previous failure, instead of creating a duplicate", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    const lyrics = createApprovedLyrics(lead.id);
    lyricsRepository.seed(lyrics);
    const failedSong = Song.create({ leadId: lead.id, lyricsId: lyrics.id, moodId: lyrics.moodId });
    failedSong.markGenerating();
    failedSong.markFailed();
    songRepository.seed(failedSong);

    const useCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
    );

    const response = await useCase.execute({ leadId: lead.id });

    expect(response.song.id).toBe(failedSong.id);
    expect(response.song.status).toBe(SongStatus.FAILED);
  });
});
