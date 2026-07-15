import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import { GetLeadSessionStateUseCase } from "@/application/lead/use-cases/GetLeadSessionStateUseCase";
import type { AudioUrlResolver } from "@/application/song/contracts/AudioUrlResolver";

function fakeAudioUrlResolver(): AudioUrlResolver {
  return {
    resolve: vi.fn().mockImplementation(async (key: string) => `https://signed.example.com/${key}`),
  };
}

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

class InMemorySongRepository implements SongRepository {
  private readonly songs = new Map<string, Song>();
  seed(song: Song): void {
    this.songs.set(song.id, song);
  }
  async create(song: Song): Promise<Song> {
    this.songs.set(song.id, song);
    return song;
  }
  async findById(id: string): Promise<Song | null> {
    return this.songs.get(id) ?? null;
  }
  async findByLead(leadId: string): Promise<Song | null> {
    return [...this.songs.values()].find((song) => song.leadId === leadId) ?? null;
  }
  async findGenerating(): Promise<Song | null> {
    return [...this.songs.values()].find((song) => song.status === SongStatus.GENERATING) ?? null;
  }
  async findOldestQueued(): Promise<Song | null> {
    return (
      [...this.songs.values()]
        .filter((song) => song.status === SongStatus.QUEUED)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null
    );
  }
  async update(song: Song): Promise<Song> {
    this.songs.set(song.id, song);
    return song;
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

describe("GetLeadSessionStateUseCase", () => {
  let leadRepository: InMemoryLeadRepository;
  let lyricsRepository: InMemoryLyricsRepository;
  let songRepository: InMemorySongRepository;
  let useCase: GetLeadSessionStateUseCase;

  beforeEach(() => {
    leadRepository = new InMemoryLeadRepository();
    lyricsRepository = new InMemoryLyricsRepository();
    songRepository = new InMemorySongRepository();
    useCase = new GetLeadSessionStateUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeAudioUrlResolver(),
    );
  });

  it("throws when the lead is not found", async () => {
    await expect(useCase.execute({ leadId: "missing" })).rejects.toThrow();
  });

  it("reconstructs baseline state with no approved lyrics and no song yet", async () => {
    const lead = buildLead();
    leadRepository.seed(lead);

    const result = await useCase.execute({ leadId: lead.id });

    expect(result.babyName).toBe("Baby Doe");
    expect(result.remainingAttempts).toBe(5);
    expect(result.approvedLyrics).toBeNull();
    expect(result.song).toBeNull();
  });

  it("includes the approved lyrics summary once one exists", async () => {
    const lead = buildLead();
    leadRepository.seed(lead);

    const lyrics = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\nVerse 1",
      version: 2,
    });
    lyrics.approve();
    lyricsRepository.seed(lyrics);

    const result = await useCase.execute({ leadId: lead.id });

    expect(result.approvedLyrics).toEqual({
      id: lyrics.id,
      content: "Title\nVerse 1",
      version: 2,
    });
  });

  it("includes the current song's status, a freshly resolved audio URL, and duration once one exists", async () => {
    const lead = buildLead();
    leadRepository.seed(lead);

    const song = Song.create({ leadId: lead.id, lyricsId: "lyrics-1", moodId: "mood-1" });
    song.markGenerating();
    song.markCompleted({
      providerSongId: "suno-1",
      audioStorageKey: "songs/song-1.mp3",
      duration: 90,
    });
    songRepository.seed(song);

    const result = await useCase.execute({ leadId: lead.id });

    expect(result.song).toEqual({
      id: song.id,
      status: "COMPLETED",
      audioUrl: "https://signed.example.com/songs/song-1.mp3",
      duration: 90,
    });
  });
});
