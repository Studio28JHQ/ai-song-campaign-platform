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

  it("marks the song FAILED when the mood can no longer be found", async () => {
    const song = seedQueuedSong();
    const dispatcher = buildDispatcher({ moodProvider: fakeMoodProvider(null) });

    await expect(dispatcher.execute()).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
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
