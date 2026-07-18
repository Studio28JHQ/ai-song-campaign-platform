import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import { GenerationDispatcher } from "@/application/song/use-cases/GenerationDispatcher";
import { GenerationPoller } from "@/application/song/use-cases/GenerationPoller";
import type { AudioDownloader } from "@/application/song/contracts/AudioDownloader";
import type { AudioStorage } from "@/application/song/contracts/AudioStorage";
import type { AudioUrlResolver } from "@/application/song/contracts/AudioUrlResolver";
import type { CampaignGate } from "@/application/song/contracts/CampaignGate";
import type { EmailDeliveryTracker } from "@/application/song/contracts/EmailDeliveryTracker";
import type { SongEmailSender } from "@/application/song/contracts/SongEmailSender";
import type { MoodSunoPromptProvider } from "@/application/song/contracts/MoodSunoPromptProvider";
import { MurekaSongService } from "@/infrastructure/mureka/MurekaSongService";

/**
 * RC-final — Provider Switch. This is deliberately NOT another isolated
 * unit-test suite for `MurekaSongService`, `GenerationDispatcher`, or
 * `GenerationPoller` (those already exist). It wires the *real*
 * `MurekaSongService` — the exact same class every composition root now
 * constructs in production — into *real* `GenerationDispatcher` and
 * `GenerationPoller` instances, and drives one full
 * submit → poll(ready_to_download) → download → R2 upload → COMPLETED
 * → email cycle through them. Only `fetch` (Mureka's network boundary)
 * and the non-Mureka infrastructure ports (audio download/storage/URL
 * resolution, email sending, repositories) are faked — everything
 * Mureka-specific is the real production code path.
 *
 * This is the "verify using the existing mocked provider" fallback
 * (real Mureka generation credits are unavailable — see CHANGELOG.md)
 * for confirming the provider switch itself, not just each piece of it
 * in isolation.
 */

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
  /** See the identical comment in GenerationDispatcher.test.ts's copy of this fake. */
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

class InMemoryEmailDeliveryTracker implements EmailDeliveryTracker {
  private readonly claimed = new Set<string>();
  async claimDelivery(songId: string): Promise<boolean> {
    if (this.claimed.has(songId)) return false;
    this.claimed.add(songId);
    return true;
  }
}

function fakeMoodProvider(): MoodSunoPromptProvider {
  return {
    getMoodDetails: vi
      .fn()
      .mockResolvedValue({ name: "Joyful", sunoPrompt: "upbeat joyful lullaby" }),
  };
}

function fakeAudioDownloader(): AudioDownloader {
  return {
    download: vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "audio/mpeg",
    }),
  };
}

function fakeAudioStorage(): AudioStorage {
  return { upload: vi.fn().mockResolvedValue(undefined) };
}

function fakeAudioUrlResolver(): AudioUrlResolver {
  return {
    resolve: vi.fn().mockImplementation(async (key: string) => `https://signed.example.com/${key}`),
  };
}

function fakeEmailSender(): SongEmailSender {
  return { sendSongReadyEmail: vi.fn().mockResolvedValue(undefined) };
}

function fakeCampaignGate(): CampaignGate {
  return {
    isActiveAndGenerationEnabled: vi.fn().mockResolvedValue(true),
    incrementSongsGenerated: vi.fn().mockResolvedValue(undefined),
  };
}

function createApprovedLyrics(leadId: string): Lyrics {
  const lyrics = Lyrics.create({
    leadId,
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

describe("Mureka wired as the real production SongGenerationProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs a full submit → poll(ready_to_download) → download → R2 upload → COMPLETED → email cycle through the real MurekaSongService", async () => {
    // Mureka's real submission response shape.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: "mureka-task-789",
        created_at: 1700000000,
        model: "mureka-7.6",
        status: "preparing",
        trace_id: "trace-abc",
      }),
    });
    // Mureka's real task-query response shape, once succeeded.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: "mureka-task-789",
        status: "succeeded",
        choices: [
          {
            index: 0,
            id: "mureka-song-456",
            url: "https://cdn.mureka.ai/mureka-song-456.mp3",
            duration: 128000,
          },
        ],
      }),
    });

    const songRepository = new InMemorySongRepository();
    const lyricsRepository = new InMemoryLyricsRepository();
    const leadRepository = new InMemoryLeadRepository();
    const audioDownloader = fakeAudioDownloader();
    const audioStorage = fakeAudioStorage();
    const emailSender = fakeEmailSender();

    const lead = createLead();
    leadRepository.seed(lead);
    const lyrics = createApprovedLyrics(lead.id);
    lyricsRepository.seed(lyrics);
    const song = Song.create({ leadId: lead.id, lyricsId: lyrics.id, moodId: lyrics.moodId });
    songRepository.seed(song);

    // The real MurekaSongService, backed by a real MurekaClient — only
    // `fetch` is mocked. This is the exact class every composition root
    // now constructs.
    const murekaSongService = new MurekaSongService();

    const dispatcher = new GenerationDispatcher(
      songRepository,
      lyricsRepository,
      fakeMoodProvider(),
      murekaSongService,
    );
    const poller = new GenerationPoller(
      songRepository,
      murekaSongService,
      audioDownloader,
      audioStorage,
      fakeAudioUrlResolver(),
      leadRepository,
      emailSender,
      new InMemoryEmailDeliveryTracker(),
      fakeCampaignGate(),
    );

    const dispatchResult = await dispatcher.execute();
    expect(dispatchResult?.song.status).toBe(SongStatus.GENERATING);
    expect(dispatchResult?.song.providerTaskId).toBe("mureka-task-789");

    // Sprint v1.2 — AI Safety Hardening: the parent's raw message must
    // never reach Mureka. This is the real request body sent over the
    // real (mocked-`fetch`) `MurekaClient`/`mureka/PromptBuilder` chain
    // — not a unit test of `PromptBuilder` in isolation — so this is
    // the strongest available proof the isolation actually holds
    // end-to-end.
    const submitCallBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(submitCallBody.prompt).not.toContain("A gentle song about bedtime.");
    expect(submitCallBody.prompt).not.toContain("Baby Context");

    const pollResult = await poller.execute();
    expect(pollResult?.outcome).toBe("ready");
    expect(pollResult?.song.status).toBe(SongStatus.COMPLETED);
    expect(pollResult?.song.providerSongId).toBe("mureka-song-456");
    expect(pollResult?.song.duration).toBe(128); // Mureka's ms converted to whole seconds.

    // Only the R2 object key is persisted — never Mureka's own URL.
    expect(pollResult?.song.audioStorageKey).toBe(`songs/${song.id}.mp3`);
    expect(JSON.stringify(pollResult?.song)).not.toContain("cdn.mureka.ai");

    expect(audioDownloader.download).toHaveBeenCalledWith(
      "https://cdn.mureka.ai/mureka-song-456.mp3",
    );
    expect(audioStorage.upload).toHaveBeenCalledWith(
      `songs/${song.id}.mp3`,
      expect.any(Uint8Array),
      "audio/mpeg",
    );
    expect(emailSender.sendSongReadyEmail).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one submit call, one poll call — nothing extra.
  });

  it("marks the song FAILED, without downloading or emailing, when Mureka reports a terminal failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: "mureka-task-999",
        created_at: 1700000000,
        status: "preparing",
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: "mureka-task-999",
        status: "failed",
        failed_reason: "Content violates usage policy.",
      }),
    });

    const songRepository = new InMemorySongRepository();
    const lyricsRepository = new InMemoryLyricsRepository();
    const leadRepository = new InMemoryLeadRepository();
    const emailSender = fakeEmailSender();

    const lead = createLead();
    leadRepository.seed(lead);
    const lyrics = createApprovedLyrics(lead.id);
    lyricsRepository.seed(lyrics);
    const song = Song.create({ leadId: lead.id, lyricsId: lyrics.id, moodId: lyrics.moodId });
    songRepository.seed(song);

    const murekaSongService = new MurekaSongService();
    const dispatcher = new GenerationDispatcher(
      songRepository,
      lyricsRepository,
      fakeMoodProvider(),
      murekaSongService,
    );
    const poller = new GenerationPoller(
      songRepository,
      murekaSongService,
      fakeAudioDownloader(),
      fakeAudioStorage(),
      fakeAudioUrlResolver(),
      leadRepository,
      emailSender,
      new InMemoryEmailDeliveryTracker(),
      fakeCampaignGate(),
    );

    await dispatcher.execute();
    const pollResult = await poller.execute();

    expect(pollResult?.outcome).toBe("failed");
    expect(pollResult?.song.status).toBe(SongStatus.FAILED);
    expect(pollResult?.song.providerError).toBe("Content violates usage policy.");
    expect(emailSender.sendSongReadyEmail).not.toHaveBeenCalled();
  });
});
