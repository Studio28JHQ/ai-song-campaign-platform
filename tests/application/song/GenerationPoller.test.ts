import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import { GenerationPoller } from "@/application/song/use-cases/GenerationPoller";
import type {
  AudioDownloader,
  DownloadedAudio,
} from "@/application/song/contracts/AudioDownloader";
import type { AudioStorage } from "@/application/song/contracts/AudioStorage";
import type { AudioUrlResolver } from "@/application/song/contracts/AudioUrlResolver";
import type { EmailDeliveryTracker } from "@/application/song/contracts/EmailDeliveryTracker";
import type {
  SongEmailSender,
  SongReadyEmailInput,
} from "@/application/song/contracts/SongEmailSender";
import type {
  SongGenerationPollResult,
  SongGenerationProvider,
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

function fakeSongGenerator(result: SongGenerationPollResult): SongGenerationProvider {
  return {
    submitGeneration: vi.fn(),
    pollGenerationStatus: vi.fn().mockResolvedValue(result),
  };
}

function fakeAudioDownloader(
  audio: DownloadedAudio | Error = {
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "audio/mpeg",
  },
): AudioDownloader {
  return {
    download:
      audio instanceof Error ? vi.fn().mockRejectedValue(audio) : vi.fn().mockResolvedValue(audio),
  };
}

function fakeAudioStorage(error?: Error): AudioStorage {
  return {
    upload: error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(undefined),
  };
}

function fakeAudioUrlResolver(): AudioUrlResolver {
  return {
    resolve: vi.fn().mockImplementation(async (key: string) => `https://signed.example.com/${key}`),
  };
}

function fakeEmailSender(error?: Error): SongEmailSender {
  return {
    sendSongReadyEmail: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue(undefined),
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

function seedGeneratingSong(leadId: string, songRepository: InMemorySongRepository): Song {
  const song = Song.create({ leadId, lyricsId: "lyrics-1", moodId: "mood-1" });
  song.markGenerating();
  song.recordSubmission({ providerTaskId: "task-123", providerTraceId: null });
  songRepository.seed(song);
  return song;
}

describe("GenerationPoller", () => {
  let songRepository: InMemorySongRepository;
  let leadRepository: InMemoryLeadRepository;
  let deliveryTracker: InMemoryEmailDeliveryTracker;
  let lead: Lead;

  beforeEach(() => {
    songRepository = new InMemorySongRepository();
    leadRepository = new InMemoryLeadRepository();
    deliveryTracker = new InMemoryEmailDeliveryTracker();
    lead = createLead();
    leadRepository.seed(lead);
  });

  function buildPoller(
    options: {
      songGenerator?: SongGenerationProvider;
      audioDownloader?: AudioDownloader;
      audioStorage?: AudioStorage;
      audioUrlResolver?: AudioUrlResolver;
      emailSender?: SongEmailSender;
      deliveryTracker?: EmailDeliveryTracker;
    } = {},
  ): GenerationPoller {
    return new GenerationPoller(
      songRepository,
      options.songGenerator ?? fakeSongGenerator({ status: "pending" }),
      options.audioDownloader ?? fakeAudioDownloader(),
      options.audioStorage ?? fakeAudioStorage(),
      options.audioUrlResolver ?? fakeAudioUrlResolver(),
      leadRepository,
      options.emailSender ?? fakeEmailSender(),
      options.deliveryTracker ?? deliveryTracker,
    );
  }

  it("returns null when no song is awaiting provider completion", async () => {
    const poller = buildPoller();

    const result = await poller.execute();

    expect(result).toBeNull();
  });

  it("returns pending and leaves the song untouched when the provider hasn't finished yet", async () => {
    const song = seedGeneratingSong(lead.id, songRepository);
    const songGenerator = fakeSongGenerator({ status: "pending" });
    const poller = buildPoller({ songGenerator });

    const response = await poller.execute();

    expect(response?.outcome).toBe("pending");
    expect(songGenerator.pollGenerationStatus).toHaveBeenCalledWith("task-123");
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.GENERATING);
  });

  it("persists the provider's raw status while pending, without touching the song's own status", async () => {
    const song = seedGeneratingSong(lead.id, songRepository);
    const poller = buildPoller({
      songGenerator: fakeSongGenerator({ status: "pending", providerStatus: "running" }),
    });

    const response = await poller.execute();

    expect(response?.outcome).toBe("pending");
    const persisted = await songRepository.findById(song.id);
    expect(persisted?.status).toBe(SongStatus.GENERATING);
    expect(persisted?.providerStatus).toBe("running");
  });

  describe("ready_to_download (Gate 9.4 — Audio Download & Storage)", () => {
    function readyToDownloadPoller(overrides: Parameters<typeof buildPoller>[0] = {}) {
      return buildPoller({
        songGenerator: fakeSongGenerator({
          status: "ready_to_download",
          providerSongId: "mureka-123",
          audioUrl: "https://provider.example.com/short-lived.mp3",
          duration: 90,
          providerStatus: "succeeded",
        }),
        ...overrides,
      });
    }

    it("downloads the audio, uploads it to R2, persists only the storage key, and marks the song COMPLETED", async () => {
      const song = seedGeneratingSong(lead.id, songRepository);
      const audioDownloader = fakeAudioDownloader({
        bytes: new Uint8Array([4, 5, 6]),
        contentType: "audio/mpeg",
      });
      const audioStorage = fakeAudioStorage();
      const poller = readyToDownloadPoller({ audioDownloader, audioStorage });

      const response = await poller.execute();

      expect(response?.outcome).toBe("ready");
      expect(response?.song.status).toBe(SongStatus.COMPLETED);
      expect(audioDownloader.download).toHaveBeenCalledWith(
        "https://provider.example.com/short-lived.mp3",
      );
      expect(audioStorage.upload).toHaveBeenCalledWith(
        `songs/${song.id}.mp3`,
        expect.any(Uint8Array),
        "audio/mpeg",
      );

      const persisted = await songRepository.findById(song.id);
      expect(persisted?.status).toBe(SongStatus.COMPLETED);
      expect(persisted?.audioStorageKey).toBe(`songs/${song.id}.mp3`);
      expect(persisted?.providerSongId).toBe("mureka-123");
      expect(persisted?.duration).toBe(90);
      expect(JSON.stringify(persisted?.toSnapshot())).not.toContain("provider.example.com");
    });

    it("never sends an email for the ready_to_download outcome", async () => {
      seedGeneratingSong(lead.id, songRepository);
      const emailSender = fakeEmailSender();
      const poller = readyToDownloadPoller({ emailSender });

      await poller.execute();

      expect(emailSender.sendSongReadyEmail).not.toHaveBeenCalled();
    });

    it("marks the song FAILED and re-throws when the download fails", async () => {
      const song = seedGeneratingSong(lead.id, songRepository);
      const poller = readyToDownloadPoller({
        audioDownloader: fakeAudioDownloader(new Error("download failed")),
      });

      await expect(poller.execute()).rejects.toThrow();
      const persisted = await songRepository.findById(song.id);
      expect(persisted?.status).toBe(SongStatus.FAILED);
      expect(persisted?.audioStorageKey).toBeNull();
    });

    it("marks the song FAILED and re-throws when the R2 upload fails", async () => {
      const song = seedGeneratingSong(lead.id, songRepository);
      const poller = readyToDownloadPoller({
        audioStorage: fakeAudioStorage(new Error("R2 upload failed")),
      });

      await expect(poller.execute()).rejects.toThrow();
      const persisted = await songRepository.findById(song.id);
      expect(persisted?.status).toBe(SongStatus.FAILED);
      expect(persisted?.audioStorageKey).toBeNull();
    });

    it("never marks the song COMPLETED when the upload fails partway through", async () => {
      seedGeneratingSong(lead.id, songRepository);
      const audioStorage = fakeAudioStorage(new Error("R2 upload failed"));
      const poller = readyToDownloadPoller({ audioStorage });

      await expect(poller.execute()).rejects.toThrow();

      expect(audioStorage.upload).toHaveBeenCalledTimes(1);
    });
  });

  it("marks the song FAILED with the provider's error when polling reports failure", async () => {
    const song = seedGeneratingSong(lead.id, songRepository);
    const poller = buildPoller({
      songGenerator: fakeSongGenerator({ status: "failed", error: "Provider rejected the job." }),
    });

    const response = await poller.execute();

    expect(response?.outcome).toBe("failed");
    const persisted = await songRepository.findById(song.id);
    expect(persisted?.status).toBe(SongStatus.FAILED);
    expect(persisted?.providerError).toBe("Provider rejected the job.");
  });

  it("downloads the audio, uploads it to R2, and persists only the storage key — never a URL", async () => {
    const song = seedGeneratingSong(lead.id, songRepository);
    const audioDownloader = fakeAudioDownloader({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "audio/mpeg",
    });
    const audioStorage = fakeAudioStorage();
    const poller = buildPoller({
      songGenerator: fakeSongGenerator({
        status: "completed",
        providerSongId: "suno-123",
        audioUrl: "https://provider.example.com/short-lived.mp3",
        duration: 120,
      }),
      audioDownloader,
      audioStorage,
    });

    const response = await poller.execute();

    expect(response?.outcome).toBe("completed");
    expect(response?.song.status).toBe(SongStatus.COMPLETED);
    expect(audioDownloader.download).toHaveBeenCalledWith(
      "https://provider.example.com/short-lived.mp3",
    );
    expect(audioStorage.upload).toHaveBeenCalledWith(
      `songs/${song.id}.mp3`,
      expect.any(Uint8Array),
      "audio/mpeg",
    );

    const persisted = await songRepository.findById(song.id);
    expect(persisted?.audioStorageKey).toBe(`songs/${song.id}.mp3`);
    expect(persisted?.providerSongId).toBe("suno-123");
    expect(persisted?.duration).toBe(120);
    expect(JSON.stringify(persisted?.toSnapshot())).not.toContain("provider.example.com");
  });

  it("marks the song FAILED and re-throws when the download fails", async () => {
    const song = seedGeneratingSong(lead.id, songRepository);
    const poller = buildPoller({
      songGenerator: fakeSongGenerator({
        status: "completed",
        providerSongId: "suno-123",
        audioUrl: "https://provider.example.com/a.mp3",
        duration: 120,
      }),
      audioDownloader: fakeAudioDownloader(new Error("download failed")),
    });

    await expect(poller.execute()).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
  });

  it("marks the song FAILED and re-throws when the R2 upload fails", async () => {
    const song = seedGeneratingSong(lead.id, songRepository);
    const poller = buildPoller({
      songGenerator: fakeSongGenerator({
        status: "completed",
        providerSongId: "suno-123",
        audioUrl: "https://provider.example.com/a.mp3",
        duration: 120,
      }),
      audioStorage: fakeAudioStorage(new Error("R2 upload failed")),
    });

    await expect(poller.execute()).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
  });

  describe("email delivery", () => {
    function completingPoller(overrides: Parameters<typeof buildPoller>[0] = {}) {
      return buildPoller({
        songGenerator: fakeSongGenerator({
          status: "completed",
          providerSongId: "suno-123",
          audioUrl: "https://provider.example.com/a.mp3",
          duration: 120,
        }),
        ...overrides,
      });
    }

    it("sends exactly one song-ready email, using a resolved signed URL, once the song completes", async () => {
      seedGeneratingSong(lead.id, songRepository);
      const emailSender = fakeEmailSender();
      const poller = completingPoller({ emailSender });

      await poller.execute();

      expect(emailSender.sendSongReadyEmail).toHaveBeenCalledTimes(1);
      const input = (emailSender.sendSongReadyEmail as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as SongReadyEmailInput;
      expect(input.to).toBe("jane@example.com");
      expect(input.parentName).toBe("Jane Doe");
      expect(input.babyName).toBe("Baby Doe");
      expect(input.audioUrl).toMatch(/^https:\/\/signed\.example\.com\/songs\//);
      expect(input.duration).toBe(120);
    });

    it("never sends an email when generation fails", async () => {
      seedGeneratingSong(lead.id, songRepository);
      const emailSender = fakeEmailSender();
      const poller = buildPoller({
        songGenerator: fakeSongGenerator({ status: "failed", error: "timeout" }),
        emailSender,
      });

      await poller.execute();

      expect(emailSender.sendSongReadyEmail).not.toHaveBeenCalled();
    });

    it("never sends a duplicate email once delivery has already been claimed", async () => {
      const song = seedGeneratingSong(lead.id, songRepository);
      const emailSender = fakeEmailSender();
      // Simulate the claim already having been made by a prior run.
      await deliveryTracker.claimDelivery(song.id);

      const poller = completingPoller({ emailSender });
      await poller.execute();

      expect(emailSender.sendSongReadyEmail).not.toHaveBeenCalled();
    });

    it("does not fail the use case, and does not retry, when the email itself fails to send", async () => {
      seedGeneratingSong(lead.id, songRepository);
      const emailSender = fakeEmailSender(new Error("Resend API responded with status 500."));
      const poller = completingPoller({ emailSender });

      const response = await poller.execute();

      expect(response?.song.status).toBe(SongStatus.COMPLETED);
      expect(emailSender.sendSongReadyEmail).toHaveBeenCalledTimes(1);
      // The claim was already made before the send attempt, so a
      // subsequent run must not send again either.
      expect(await deliveryTracker.claimDelivery(response!.song.id)).toBe(false);
    });
  });
});
