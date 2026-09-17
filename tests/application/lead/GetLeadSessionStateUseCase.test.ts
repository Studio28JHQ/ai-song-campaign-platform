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
    // Ordered by version ascending, exactly as `PrismaLyricsRepository`
    // documents and `GetLeadSessionStateUseCase` relies on — a fake that
    // returned insertion order would let an ordering regression pass.
    return [...this.records.values()]
      .filter((lyrics) => lyrics.leadId === leadId)
      .sort((a, b) => a.version - b.version);
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
  async claimQueued(song: Song): Promise<Song | null> {
    const existing = this.songs.get(song.id);
    if (!existing || existing.status !== SongStatus.QUEUED) {
      return null;
    }
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
    expect(result.pendingLyrics).toBeNull();
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
      parentMessage: "A gentle song about bedtime.",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
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
  describe("resuming a version the parent generated but never approved", () => {
    function buildVersion(leadId: string, version: number, content: string): Lyrics {
      return Lyrics.create({
        leadId,
        moodId: "mood-1",
        prompt: "prompt",
        content,
        version,
        parentMessage: "A gentle song about bedtime.",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
        voice: "FEMALE",
      });
    }

    it("B — returns the only version when it has never been approved, with everything needed to regenerate from it", async () => {
      const lead = buildLead();
      leadRepository.seed(lead);
      const pending = buildVersion(lead.id, 1, "Title\nVerse 1");
      lyricsRepository.seed(pending);

      const result = await useCase.execute({ leadId: lead.id });

      expect(result.pendingLyrics).toEqual({
        id: pending.id,
        content: "Title\nVerse 1",
        version: 1,
        moodId: "mood-1",
        parentMessage: "A gentle song about bedtime.",
        voice: "FEMALE",
      });
      expect(result.approvedLyrics).toBeNull();
    });

    it("never exposes the Claude-authored prompt or musical direction alongside it", async () => {
      const lead = buildLead();
      leadRepository.seed(lead);
      lyricsRepository.seed(buildVersion(lead.id, 1, "Title\nVerse 1"));

      const result = await useCase.execute({ leadId: lead.id });

      expect(Object.keys(result.pendingLyrics ?? {}).sort()).toEqual([
        "content",
        "id",
        "moodId",
        "parentMessage",
        "version",
        "voice",
      ]);
    });

    it("B — returns the latest version when several were generated and none approved", async () => {
      const lead = buildLead();
      leadRepository.seed(lead);
      lyricsRepository.seed(buildVersion(lead.id, 1, "First"));
      const latest = buildVersion(lead.id, 2, "Second");
      lyricsRepository.seed(latest);

      const result = await useCase.execute({ leadId: lead.id });

      expect(result.pendingLyrics).toMatchObject({
        id: latest.id,
        content: "Second",
        version: 2,
      });
    });

    it("C — reports nothing pending when the newest version is the approved one", async () => {
      const lead = buildLead();
      leadRepository.seed(lead);
      lyricsRepository.seed(buildVersion(lead.id, 1, "First"));
      const approved = buildVersion(lead.id, 2, "Second");
      approved.approve();
      lyricsRepository.seed(approved);

      const result = await useCase.execute({ leadId: lead.id });

      expect(result.approvedLyrics).toEqual({ id: approved.id, content: "Second", version: 2 });
      // v1 is unapproved, but it sits *behind* the approval — approval is
      // terminal, so there is no step left to resume.
      expect(result.pendingLyrics).toBeNull();
    });

    it("D — reports a version created after an approval as pending, without displacing the approved one", async () => {
      const lead = buildLead();
      leadRepository.seed(lead);
      lyricsRepository.seed(buildVersion(lead.id, 1, "First"));
      const approved = buildVersion(lead.id, 2, "Second");
      approved.approve();
      lyricsRepository.seed(approved);
      const newer = buildVersion(lead.id, 3, "Third");
      lyricsRepository.seed(newer);

      const result = await useCase.execute({ leadId: lead.id });

      expect(result.approvedLyrics).toEqual({ id: approved.id, content: "Second", version: 2 });
      expect(result.pendingLyrics).toMatchObject({ id: newer.id, content: "Third", version: 3 });
    });

    it("derives the approved version from the same single read, with no second repository call", async () => {
      const lead = buildLead();
      leadRepository.seed(lead);
      const approved = buildVersion(lead.id, 1, "Only");
      approved.approve();
      lyricsRepository.seed(approved);
      const findApprovedSpy = vi.spyOn(lyricsRepository, "findApprovedByLead");

      const result = await useCase.execute({ leadId: lead.id });

      expect(result.approvedLyrics).toEqual({ id: approved.id, content: "Only", version: 1 });
      expect(findApprovedSpy).not.toHaveBeenCalled();
    });

    it("never leaks another lead's pending version", async () => {
      const lead = buildLead();
      const otherLead = Lead.create(
        {
          campaignId: "campaign-1",
          parentName: "John Roe",
          babyName: "Baby Roe",
          email: "john@example.com",
        },
        5,
      );
      leadRepository.seed(lead);
      leadRepository.seed(otherLead);
      lyricsRepository.seed(buildVersion(otherLead.id, 1, "Somebody else's song"));

      const result = await useCase.execute({ leadId: lead.id });

      expect(result.pendingLyrics).toBeNull();
    });
  });
});
