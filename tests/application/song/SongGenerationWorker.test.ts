import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import { SongGenerationWorker } from "@/application/song/use-cases/SongGenerationWorker";
import type { EmailDeliveryTracker } from "@/application/song/contracts/EmailDeliveryTracker";
import type { MoodSunoPromptProvider } from "@/application/song/contracts/MoodSunoPromptProvider";
import type {
  SongEmailSender,
  SongReadyEmailInput,
} from "@/application/song/contracts/SongEmailSender";
import type {
  SongGenerationProvider,
  SongGenerationResult,
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

/** In-memory stand-in for the atomic `claimDelivery` DB flag — true exactly once per songId. */
class InMemoryEmailDeliveryTracker implements EmailDeliveryTracker {
  private readonly claimed = new Set<string>();
  async claimDelivery(songId: string): Promise<boolean> {
    if (this.claimed.has(songId)) return false;
    this.claimed.add(songId);
    return true;
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
  result: SongGenerationResult | Error = {
    providerSongId: "suno-123",
    audioUrl: "https://cdn.example.com/song.mp3",
    duration: 120,
  },
): SongGenerationProvider {
  return {
    generateSong:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
  };
}

function fakeEmailSender(error?: Error): SongEmailSender {
  return {
    sendSongReadyEmail: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue(undefined),
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

describe("SongGenerationWorker", () => {
  let lyricsRepository: InMemoryLyricsRepository;
  let songRepository: InMemorySongRepository;
  let leadRepository: InMemoryLeadRepository;
  let deliveryTracker: InMemoryEmailDeliveryTracker;
  let lead: Lead;

  beforeEach(() => {
    lyricsRepository = new InMemoryLyricsRepository();
    songRepository = new InMemorySongRepository();
    leadRepository = new InMemoryLeadRepository();
    deliveryTracker = new InMemoryEmailDeliveryTracker();
    lead = createLead();
    leadRepository.seed(lead);
  });

  function buildWorker(
    options: {
      moodProvider?: MoodSunoPromptProvider;
      songGenerator?: SongGenerationProvider;
      emailSender?: SongEmailSender;
      deliveryTracker?: EmailDeliveryTracker;
    } = {},
  ): SongGenerationWorker {
    return new SongGenerationWorker(
      songRepository,
      lyricsRepository,
      options.moodProvider ?? fakeMoodProvider(),
      options.songGenerator ?? fakeSongGenerator(),
      leadRepository,
      options.emailSender ?? fakeEmailSender(),
      options.deliveryTracker ?? deliveryTracker,
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
    const worker = buildWorker();

    const result = await worker.execute();

    expect(result).toBeNull();
  });

  it("skips this run and does not touch any song when a generation is already in flight", async () => {
    const generatingSong = seedQueuedSong();
    generatingSong.markGenerating();
    songRepository.seed(generatingSong);
    const queuedSong = seedQueuedSong();
    const songGenerator = fakeSongGenerator();
    const worker = buildWorker({ songGenerator });

    const result = await worker.execute();

    expect(result).toBeNull();
    expect(songGenerator.generateSong).not.toHaveBeenCalled();
    expect((await songRepository.findById(queuedSong.id))?.status).toBe(SongStatus.QUEUED);
  });

  it("moves the oldest QUEUED song through GENERATING to COMPLETED on success, making exactly one provider request", async () => {
    const song = seedQueuedSong();
    const songGenerator = fakeSongGenerator();
    const worker = buildWorker({ songGenerator });

    const response = await worker.execute();

    expect(response?.song.status).toBe(SongStatus.COMPLETED);
    expect(response?.song.audioUrl).toBe("https://cdn.example.com/song.mp3");
    expect(songGenerator.generateSong).toHaveBeenCalledTimes(1);

    const persisted = await songRepository.findById(song.id);
    expect(persisted?.status).toBe(SongStatus.COMPLETED);
  });

  it("marks the song FAILED and re-throws on a provider failure", async () => {
    const song = seedQueuedSong();
    const worker = buildWorker({
      songGenerator: fakeSongGenerator(new Error("Suno API responded with status 503.")),
    });

    await expect(worker.execute()).rejects.toThrow();

    const persisted = await songRepository.findById(song.id);
    expect(persisted?.status).toBe(SongStatus.FAILED);
  });

  it("marks the song FAILED when the approved lyrics can no longer be found", async () => {
    const song = Song.create({ leadId: lead.id, lyricsId: "missing-lyrics", moodId: "mood-1" });
    songRepository.seed(song);

    const worker = buildWorker();

    await expect(worker.execute()).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
  });

  it("marks the song FAILED when the mood can no longer be found", async () => {
    const song = seedQueuedSong();
    const worker = buildWorker({ moodProvider: fakeMoodProvider(null) });

    await expect(worker.execute()).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
  });

  it("allows retrying the same song after a failure, succeeding on the next run", async () => {
    const song = seedQueuedSong();

    const failingWorker = buildWorker({
      songGenerator: fakeSongGenerator(new Error("timeout")),
    });
    await expect(failingWorker.execute()).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);

    const requeued = await songRepository.findById(song.id);
    requeued?.retryFromFailure();
    if (requeued) await songRepository.update(requeued);

    const succeedingWorker = buildWorker();
    const response = await succeedingWorker.execute();

    expect(response?.song.status).toBe(SongStatus.COMPLETED);
    expect(response?.song.id).toBe(song.id);
  });

  describe("email delivery", () => {
    it("sends exactly one song-ready email when the song completes", async () => {
      seedQueuedSong();
      const emailSender = fakeEmailSender();
      const worker = buildWorker({ emailSender });

      await worker.execute();

      expect(emailSender.sendSongReadyEmail).toHaveBeenCalledTimes(1);
      const input = (emailSender.sendSongReadyEmail as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as SongReadyEmailInput;
      expect(input.to).toBe("jane@example.com");
      expect(input.parentName).toBe("Jane Doe");
      expect(input.babyName).toBe("Baby Doe");
      expect(input.audioUrl).toBe("https://cdn.example.com/song.mp3");
      expect(input.duration).toBe(120);
    });

    it("never sends an email when generation fails", async () => {
      seedQueuedSong();
      const emailSender = fakeEmailSender();
      const worker = buildWorker({
        emailSender,
        songGenerator: fakeSongGenerator(new Error("timeout")),
      });

      await expect(worker.execute()).rejects.toThrow();

      expect(emailSender.sendSongReadyEmail).not.toHaveBeenCalled();
    });

    it("never sends a duplicate email once delivery has already been claimed", async () => {
      const song = seedQueuedSong();
      const emailSender = fakeEmailSender();
      // Simulate the claim already having been made by a prior run.
      await deliveryTracker.claimDelivery(song.id);

      const worker = buildWorker({ emailSender });
      await worker.execute();

      expect(emailSender.sendSongReadyEmail).not.toHaveBeenCalled();
    });

    it("does not fail the use case, and does not retry, when the email itself fails to send", async () => {
      seedQueuedSong();
      const emailSender = fakeEmailSender(new Error("Resend API responded with status 500."));
      const worker = buildWorker({ emailSender });

      const response = await worker.execute();

      expect(response?.song.status).toBe(SongStatus.COMPLETED);
      expect(emailSender.sendSongReadyEmail).toHaveBeenCalledTimes(1);
      // The claim was already made before the send attempt, so a
      // subsequent run (e.g. a manual retry) must not send again either.
      expect(await deliveryTracker.claimDelivery(response!.song.id)).toBe(false);
    });
  });
});
