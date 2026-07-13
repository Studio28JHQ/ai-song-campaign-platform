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
import type { MoodSunoPromptProvider } from "@/application/song/contracts/MoodSunoPromptProvider";
import type {
  SunoGenerator,
  SunoGenerationResult,
} from "@/application/song/contracts/SunoGenerator";

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
  async update(song: Song): Promise<Song> {
    this.records.set(song.id, song);
    return song;
  }
}

function fakeCampaignGate(allowed = true): CampaignGate {
  return { isActiveAndGenerationEnabled: vi.fn().mockResolvedValue(allowed) };
}

function fakeMoodProvider(): MoodSunoPromptProvider {
  return {
    getMoodDetails: vi
      .fn()
      .mockResolvedValue({ name: "Joyful", sunoPrompt: "upbeat joyful lullaby" }),
  };
}

function fakeSunoGenerator(
  result: SunoGenerationResult | Error = {
    providerSongId: "suno-123",
    audioUrl: "https://cdn.example.com/song.mp3",
    duration: 120,
  },
): SunoGenerator {
  return {
    generateSong:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
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
      fakeMoodProvider(),
      fakeSunoGenerator(),
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
      fakeMoodProvider(),
      fakeSunoGenerator(),
    );

    await expect(useCase.execute({ leadId: lead.id })).rejects.toThrow();
    expect(await songRepository.findByLead(lead.id)).toBeNull();
  });

  it("rejects when the campaign is disabled, before ever checking lyrics or calling Suno", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    const suno = fakeSunoGenerator();
    const useCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(false),
      fakeMoodProvider(),
      suno,
    );

    await expect(useCase.execute({ leadId: lead.id })).rejects.toThrow();
    expect(suno.generateSong).not.toHaveBeenCalled();
  });

  it("generates exactly one song on success", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    const lyrics = createApprovedLyrics(lead.id);
    lyricsRepository.seed(lyrics);
    const suno = fakeSunoGenerator();
    const useCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
      fakeMoodProvider(),
      suno,
    );

    const response = await useCase.execute({ leadId: lead.id });

    expect(response.song.status).toBe(SongStatus.READY);
    expect(response.song.audioUrl).toBe("https://cdn.example.com/song.mp3");
    expect(response.song.provider).toBe("suno");
    expect(suno.generateSong).toHaveBeenCalledTimes(1);
  });

  it("rejects a second generation once a song is already READY", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    const lyrics = createApprovedLyrics(lead.id);
    lyricsRepository.seed(lyrics);
    const useCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
      fakeMoodProvider(),
      fakeSunoGenerator(),
    );

    await useCase.execute({ leadId: lead.id });

    const suno = fakeSunoGenerator();
    const retryUseCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
      fakeMoodProvider(),
      suno,
    );

    await expect(retryUseCase.execute({ leadId: lead.id })).rejects.toThrow();
    expect(suno.generateSong).not.toHaveBeenCalled();

    const songs = await songRepository.findByLead(lead.id);
    expect(songs?.status).toBe(SongStatus.READY);
  });

  it("marks the song FAILED and re-throws on a provider failure, without leaving it stuck in GENERATING", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    const lyrics = createApprovedLyrics(lead.id);
    lyricsRepository.seed(lyrics);
    const useCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
      fakeMoodProvider(),
      fakeSunoGenerator(new Error("Suno API responded with status 503.")),
    );

    await expect(useCase.execute({ leadId: lead.id })).rejects.toThrow();

    const song = await songRepository.findByLead(lead.id);
    expect(song?.status).toBe(SongStatus.FAILED);
  });

  it("allows retrying the same song after a provider failure, reusing the same row", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    const lyrics = createApprovedLyrics(lead.id);
    lyricsRepository.seed(lyrics);

    const failingUseCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
      fakeMoodProvider(),
      fakeSunoGenerator(new Error("Suno API responded with status 503.")),
    );
    await expect(failingUseCase.execute({ leadId: lead.id })).rejects.toThrow();

    const failedSong = await songRepository.findByLead(lead.id);
    expect(failedSong?.status).toBe(SongStatus.FAILED);
    const failedSongId = failedSong?.id;

    const succeedingUseCase = new GenerateSongUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      fakeCampaignGate(),
      fakeMoodProvider(),
      fakeSunoGenerator(),
    );
    const response = await succeedingUseCase.execute({ leadId: lead.id });

    expect(response.song.status).toBe(SongStatus.READY);
    expect(response.song.id).toBe(failedSongId);
  });
});
