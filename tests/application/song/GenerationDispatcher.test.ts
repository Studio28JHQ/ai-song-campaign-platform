import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import { GenerationDispatcher } from "@/application/song/use-cases/GenerationDispatcher";
import type { MoodSunoPromptProvider } from "@/application/song/contracts/MoodSunoPromptProvider";
import type {
  SongGenerationProvider,
  SongGenerationSubmission,
} from "@/application/song/contracts/SongGenerationProvider";

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
  /**
   * `Song` is mutated in place before a repository write ever happens
   * (e.g. `markGenerating()` runs before `claimQueued()` is called), so
   * checking `records.get(id).status` inside `claimQueued` would see the
   * caller's own not-yet-persisted mutation, not the last *persisted*
   * status — defeating the whole point of the conditional claim. This
   * tracks status as of the last successful write, independent of the
   * live (shared-reference) `Song` object's current in-memory state.
   */
  private readonly persistedStatus = new Map<string, SongStatus>();
  seed(song: Song): void {
    this.records.set(song.id, song);
    this.persistedStatus.set(song.id, song.status);
  }
  async create(song: Song): Promise<Song> {
    this.records.set(song.id, song);
    this.persistedStatus.set(song.id, song.status);
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
    this.persistedStatus.set(song.id, song.status);
    return song;
  }
  async claimQueued(song: Song): Promise<Song | null> {
    if (this.persistedStatus.get(song.id) !== SongStatus.QUEUED) {
      return null;
    }
    this.records.set(song.id, song);
    this.persistedStatus.set(song.id, song.status);
    return song;
  }
}

function fakeMoodProvider(
  details: { name: string; sunoPrompt: string } | null = {
    name: "Joyful",
    sunoPrompt: "upbeat joyful lullaby",
  },
): MoodSunoPromptProvider {
  return { getMoodDetails: vi.fn().mockResolvedValue(details) };
}

function fakeSongGenerator(
  submission: SongGenerationSubmission | Error = {
    providerTaskId: "task-123",
    providerTraceId: null,
  },
): SongGenerationProvider {
  return {
    submitGeneration:
      submission instanceof Error
        ? vi.fn().mockRejectedValue(submission)
        : vi.fn().mockResolvedValue(submission),
    pollGenerationStatus: vi.fn(),
  };
}

function createApprovedLyrics(): Lyrics {
  const lyrics = Lyrics.create({
    leadId: "lead-1",
    moodId: "mood-1",
    prompt: "prompt",
    content: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
    version: 1,
    parentMessage: "A gentle song about bedtime.",
    musicMood: "Warm, joyful and playful.",
    musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
    voice: "FEMALE",
  });
  lyrics.approve();
  return lyrics;
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

describe("GenerationDispatcher", () => {
  let lyricsRepository: InMemoryLyricsRepository;
  let songRepository: InMemorySongRepository;
  let lead: Lead;

  beforeEach(() => {
    lyricsRepository = new InMemoryLyricsRepository();
    songRepository = new InMemorySongRepository();
    const leadRepository = new InMemoryLeadRepository();
    lead = createLead();
    leadRepository.seed(lead);
  });

  function buildDispatcher(
    options: {
      moodProvider?: MoodSunoPromptProvider;
      songGenerator?: SongGenerationProvider;
    } = {},
  ): GenerationDispatcher {
    return new GenerationDispatcher(
      songRepository,
      lyricsRepository,
      options.moodProvider ?? fakeMoodProvider(),
      options.songGenerator ?? fakeSongGenerator(),
    );
  }

  function seedQueuedSong(): Song {
    const lyrics = createApprovedLyrics();
    lyricsRepository.seed(lyrics);
    const song = Song.create({ leadId: lead.id, lyricsId: lyrics.id, moodId: lyrics.moodId });
    songRepository.seed(song);
    return song;
  }

  /** A Song stuck `GENERATING` since `minutesAgo` minutes ago (RC-2 — stuck-song reclaim). */
  function seedStuckGeneratingSong(minutesAgo: number): Song {
    const submittedAt = new Date(Date.now() - minutesAgo * 60_000);
    const song = Song.fromPersistence({
      id: crypto.randomUUID(),
      leadId: lead.id,
      lyricsId: "lyrics-stuck",
      moodId: "mood-1",
      provider: "suno",
      providerSongId: null,
      providerTaskId: "task-stuck",
      providerTraceId: null,
      providerStatus: "submitted",
      providerError: null,
      audioStorageKey: null,
      duration: null,
      status: SongStatus.GENERATING,
      submittedAt,
      generatedAt: null,
      completedAt: null,
      emailedAt: null,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    });
    songRepository.seed(song);
    return song;
  }

  it("returns null when there is no queued song", async () => {
    const dispatcher = buildDispatcher();

    const result = await dispatcher.execute();

    expect(result).toBeNull();
  });

  it("skips this run and does not touch any song when a generation is already in flight", async () => {
    const generatingSong = seedQueuedSong();
    generatingSong.markGenerating();
    songRepository.seed(generatingSong);
    const queuedSong = seedQueuedSong();
    const songGenerator = fakeSongGenerator();
    const dispatcher = buildDispatcher({ songGenerator });

    const result = await dispatcher.execute();

    expect(result).toBeNull();
    expect(songGenerator.submitGeneration).not.toHaveBeenCalled();
    expect((await songRepository.findById(queuedSong.id))?.status).toBe(SongStatus.QUEUED);
  });

  it("moves the oldest QUEUED song to GENERATING and records the submission, without downloading, storing, or emailing anything", async () => {
    const song = seedQueuedSong();
    const songGenerator = fakeSongGenerator({
      providerTaskId: "task-123",
      providerTraceId: "trace-456",
    });
    const dispatcher = buildDispatcher({ songGenerator });

    const response = await dispatcher.execute();

    expect(response?.song.status).toBe(SongStatus.GENERATING);
    expect(response?.song.providerTaskId).toBe("task-123");
    expect(response?.song.providerTraceId).toBe("trace-456");
    expect(response?.song.audioStorageKey).toBeNull();
    expect(songGenerator.submitGeneration).toHaveBeenCalledTimes(1);

    const persisted = await songRepository.findById(song.id);
    expect(persisted?.status).toBe(SongStatus.GENERATING);
    expect(persisted?.providerTaskId).toBe("task-123");
  });

  it("does not submit when another run has already atomically claimed the song", async () => {
    seedQueuedSong();
    const claimSpy = vi.spyOn(songRepository, "claimQueued").mockResolvedValue(null);
    const songGenerator = fakeSongGenerator();
    const dispatcher = buildDispatcher({ songGenerator });

    const result = await dispatcher.execute();

    expect(result).toBeNull();
    expect(claimSpy).toHaveBeenCalledTimes(1);
    expect(songGenerator.submitGeneration).not.toHaveBeenCalled();
  });

  it("marks the song FAILED and re-throws on a submission failure", async () => {
    const song = seedQueuedSong();
    const dispatcher = buildDispatcher({
      songGenerator: fakeSongGenerator(new Error("Suno API responded with status 503.")),
    });

    await expect(dispatcher.execute()).rejects.toThrow();

    const persisted = await songRepository.findById(song.id);
    expect(persisted?.status).toBe(SongStatus.FAILED);
    expect(persisted?.providerError).toContain("503");
  });

  it("marks the song FAILED when the approved lyrics can no longer be found", async () => {
    const song = Song.create({ leadId: lead.id, lyricsId: "missing-lyrics", moodId: "mood-1" });
    songRepository.seed(song);

    const dispatcher = buildDispatcher();

    await expect(dispatcher.execute()).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
  });

  it("marks the song FAILED when the approved lyrics has no musical direction (Sprint v1.1 — a pre-migration row)", async () => {
    const legacyLyrics = Lyrics.fromPersistence({
      id: "lyrics-legacy",
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
      parentMessage: null,
      musicMood: null,
      musicDirection: null,
      voice: "FEMALE",
      approved: true,
      rejectionReason: null,
      version: 1,
      createdAt: new Date(),
    });
    lyricsRepository.seed(legacyLyrics);
    const song = Song.create({ leadId: lead.id, lyricsId: legacyLyrics.id, moodId: "mood-1" });
    songRepository.seed(song);

    const dispatcher = buildDispatcher();

    await expect(dispatcher.execute()).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
  });

  it("marks the song FAILED when the mood can no longer be found", async () => {
    const song = seedQueuedSong();
    const dispatcher = buildDispatcher({ moodProvider: fakeMoodProvider(null) });

    await expect(dispatcher.execute()).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
  });

  describe("stuck-song reclaim (RC-2 — Production Hardening)", () => {
    it("still skips a generation that is in flight but within the timeout", async () => {
      seedStuckGeneratingSong(5);
      const songGenerator = fakeSongGenerator();
      const dispatcher = buildDispatcher({ songGenerator });

      const result = await dispatcher.execute();

      expect(result).toBeNull();
      expect(songGenerator.submitGeneration).not.toHaveBeenCalled();
    });

    it("reclaims a song stuck GENERATING past the timeout: marks it FAILED with a providerError", async () => {
      const stuck = seedStuckGeneratingSong(31);
      const dispatcher = buildDispatcher();

      await dispatcher.execute();

      const persisted = await songRepository.findById(stuck.id);
      expect(persisted?.status).toBe(SongStatus.FAILED);
      expect(persisted?.providerError).toContain("30");
    });

    it("continues with the next queued song in the same run after reclaiming a stuck one", async () => {
      seedStuckGeneratingSong(31);
      const queuedSong = seedQueuedSong();
      const songGenerator = fakeSongGenerator({
        providerTaskId: "task-456",
        providerTraceId: null,
      });
      const dispatcher = buildDispatcher({ songGenerator });

      const response = await dispatcher.execute();

      expect(songGenerator.submitGeneration).toHaveBeenCalledTimes(1);
      expect(response?.song.id).toBe(queuedSong.id);
      expect(response?.song.status).toBe(SongStatus.GENERATING);
    });

    it("never reclaims and never dispatches when the queue is otherwise empty", async () => {
      const stuck = seedStuckGeneratingSong(31);
      const dispatcher = buildDispatcher();

      const response = await dispatcher.execute();

      expect(response).toBeNull();
      expect((await songRepository.findById(stuck.id))?.status).toBe(SongStatus.FAILED);
    });

    it("the reclaimed song can be retried afterward via the existing admin retry flow", async () => {
      const stuck = seedStuckGeneratingSong(31);
      const dispatcher = buildDispatcher();
      await dispatcher.execute();

      const failed = await songRepository.findById(stuck.id);
      expect(() => failed?.retryFromFailure()).not.toThrow();
    });
  });

  it("allows retrying the same song after a failure, submitting again on the next run", async () => {
    const song = seedQueuedSong();

    const failingDispatcher = buildDispatcher({
      songGenerator: fakeSongGenerator(new Error("timeout")),
    });
    await expect(failingDispatcher.execute()).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);

    const requeued = await songRepository.findById(song.id);
    requeued?.retryFromFailure();
    if (requeued) await songRepository.update(requeued);

    const succeedingDispatcher = buildDispatcher();
    const response = await succeedingDispatcher.execute();

    expect(response?.song.status).toBe(SongStatus.GENERATING);
    expect(response?.song.id).toBe(song.id);
  });
});
