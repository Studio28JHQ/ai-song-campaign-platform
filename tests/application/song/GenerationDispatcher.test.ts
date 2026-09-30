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
import type {
  CampaignSettingsGate,
  GenerationRouting,
} from "@/application/campaign/contracts/CampaignSettingsGate";
import { SongCompletionService } from "@/application/song/services/SongCompletionService";
import { ExternalApiError } from "@/shared/errors";
import { SongGenerationProviderRegistry } from "@/application/song/services/SongGenerationProviderRegistry";

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
    kind: "async",
    providerTaskId: "task-123",
    providerTraceId: null,
  },
  overrides: { name?: "mureka" | "lyria"; model?: string } = {},
): SongGenerationProvider {
  return {
    name: overrides.name ?? "mureka",
    model: overrides.model ?? "mureka-9",
    submitGeneration:
      submission instanceof Error
        ? vi.fn().mockRejectedValue(submission)
        : vi.fn().mockResolvedValue(submission),
    pollGenerationStatus: vi.fn(),
  };
}

const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000000";

/**
 * For the asynchronous-provider paths, where the dispatcher must never reach
 * completion handling: calling this fails the test loudly instead of silently
 * passing.
 */
function unusedCompletionService(): SongCompletionService {
  return {
    complete: vi.fn(() => {
      throw new Error("SongCompletionService must not be used for an async submission");
    }),
  } as unknown as SongCompletionService;
}

/** Records the bytes handed over by a synchronous provider's submission. */
function recordingCompletionService(): {
  service: SongCompletionService;
  complete: ReturnType<typeof vi.fn>;
} {
  const complete = vi.fn(async (song: { markCompleted: unknown }) => song);
  return { service: { complete } as unknown as SongCompletionService, complete };
}

/**
 * The routing half of `CampaignSettingsGate`. The GTM methods are part of the
 * same port but are never touched by the dispatcher, so they throw rather
 * than pretend.
 */
function fakeRoutingGate(routing: GenerationRouting): CampaignSettingsGate {
  return {
    getGtmContainerId: vi.fn(),
    updateGtmContainerId: vi.fn(),
    getGenerationRouting: vi.fn().mockResolvedValue(routing),
    updateGenerationRouting: vi.fn(),
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
      providers?: SongGenerationProvider[];
      routing?: GenerationRouting;
      completionService?: SongCompletionService;
    } = {},
  ): GenerationDispatcher {
    const providers = options.providers ?? [options.songGenerator ?? fakeSongGenerator()];

    return new GenerationDispatcher(
      songRepository,
      lyricsRepository,
      options.moodProvider ?? fakeMoodProvider(),
      new SongGenerationProviderRegistry(providers),
      fakeRoutingGate(options.routing ?? { primaryProvider: "mureka", fallbackProvider: null }),
      options.completionService ?? unusedCompletionService(),
      CAMPAIGN_ID,
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
      providerModel: null,
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
      publicShareToken: null,
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
      kind: "async",
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
        kind: "async",
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
  describe("provider routing", () => {
    const quotaExceeded = () => new ExternalApiError("quota", { code: "mureka.quota_exceeded" });
    const lyriaQuotaExceeded = () =>
      new ExternalApiError("quota", { code: "lyria.quota_exceeded" });

    function immediateSubmission(): SongGenerationSubmission {
      return {
        kind: "immediate",
        providerSongId: "interaction-1",
        audio: { bytes: new Uint8Array([9, 9, 9]), contentType: "audio/mpeg" },
      };
    }

    it("submits to the configured primary provider (Mureka) and records it on the song", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(undefined, { name: "mureka", model: "mureka-9" });
      const lyria = fakeSongGenerator(undefined, { name: "lyria", model: "lyria-3.5" });

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "mureka", fallbackProvider: "lyria" },
      });
      await dispatcher.execute();

      expect(mureka.submitGeneration).toHaveBeenCalledTimes(1);
      expect(lyria.submitGeneration).not.toHaveBeenCalled();

      const persisted = await songRepository.findById(song.id);
      expect(persisted?.provider).toBe("mureka");
      expect(persisted?.providerModel).toBe("mureka-9");
    });

    it("submits to Lyria, and completes the song in the same run, when Lyria is the primary", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(undefined, { name: "mureka", model: "mureka-9" });
      const lyria = fakeSongGenerator(immediateSubmission(), {
        name: "lyria",
        model: "lyria-3.5",
      });
      const { service, complete } = recordingCompletionService();

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "lyria", fallbackProvider: "mureka" },
        completionService: service,
      });
      await dispatcher.execute();

      expect(lyria.submitGeneration).toHaveBeenCalledTimes(1);
      expect(mureka.submitGeneration).not.toHaveBeenCalled();
      // The synchronous provider's audio goes through the shared completion
      // service — the same one the polling path uses — not a second pipeline.
      expect(complete).toHaveBeenCalledTimes(1);
      expect(complete.mock.calls[0][1]).toEqual({
        bytes: new Uint8Array([9, 9, 9]),
        contentType: "audio/mpeg",
        providerSongId: "interaction-1",
      });

      const persisted = await songRepository.findById(song.id);
      expect(persisted?.provider).toBe("lyria");
      expect(persisted?.providerModel).toBe("lyria-3.5");
      expect(persisted?.submittedAt).not.toBeNull();
    });

    it("falls back from Mureka to Lyria on an exhausted quota, and records Lyria as the provider", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(quotaExceeded(), { name: "mureka", model: "mureka-9" });
      const lyria = fakeSongGenerator(immediateSubmission(), {
        name: "lyria",
        model: "lyria-3.5",
      });
      const { service, complete } = recordingCompletionService();

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "mureka", fallbackProvider: "lyria" },
        completionService: service,
      });
      await dispatcher.execute();

      expect(mureka.submitGeneration).toHaveBeenCalledTimes(1);
      expect(lyria.submitGeneration).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledTimes(1);

      const persisted = await songRepository.findById(song.id);
      expect(persisted?.provider).toBe("lyria");
      expect(persisted?.providerModel).toBe("lyria-3.5");
    });

    it("falls back from Lyria to Mureka when Google's content policy refuses the lyric", async () => {
      // Deterministic and pre-generation: Google refused the prompt, produced
      // no audio and charged nothing, so the other provider can safely take
      // over. Mureka runs no such filter.
      const song = seedQueuedSong();
      const lyria = fakeSongGenerator(
        new ExternalApiError("blocked", { code: "lyria.content_blocked" }),
        { name: "lyria", model: "lyria-3.5" },
      );
      const mureka = fakeSongGenerator(undefined, { name: "mureka", model: "mureka-9" });

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "lyria", fallbackProvider: "mureka" },
      });
      await dispatcher.execute();

      expect(lyria.submitGeneration).toHaveBeenCalledTimes(1);
      expect(mureka.submitGeneration).toHaveBeenCalledTimes(1);

      const persisted = await songRepository.findById(song.id);
      expect(persisted?.provider).toBe("mureka");
      expect(persisted?.providerModel).toBe("mureka-9");
    });

    it("does not fall back on a generic Lyria invalid request — that is our own payload bug", async () => {
      seedQueuedSong();
      const lyria = fakeSongGenerator(
        new ExternalApiError("bad payload", { code: "lyria.invalid_request" }),
        { name: "lyria", model: "lyria-3.5" },
      );
      const mureka = fakeSongGenerator(undefined, { name: "mureka", model: "mureka-9" });

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "lyria", fallbackProvider: "mureka" },
      });
      await expect(dispatcher.execute()).rejects.toThrow();

      expect(mureka.submitGeneration).not.toHaveBeenCalled();
    });

    it("falls back from Lyria to Mureka on an exhausted quota — the policy is symmetric", async () => {
      const song = seedQueuedSong();
      const lyria = fakeSongGenerator(lyriaQuotaExceeded(), {
        name: "lyria",
        model: "lyria-3.5",
      });
      const mureka = fakeSongGenerator(undefined, { name: "mureka", model: "mureka-9" });

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "lyria", fallbackProvider: "mureka" },
      });
      await dispatcher.execute();

      expect(lyria.submitGeneration).toHaveBeenCalledTimes(1);
      expect(mureka.submitGeneration).toHaveBeenCalledTimes(1);

      const persisted = await songRepository.findById(song.id);
      expect(persisted?.provider).toBe("mureka");
      expect(persisted?.providerModel).toBe("mureka-9");
    });

    it("never attempts a second provider when the fallback is disabled", async () => {
      const song = seedQueuedSong();
      const lyria = fakeSongGenerator(lyriaQuotaExceeded(), {
        name: "lyria",
        model: "lyria-3.5",
      });
      const mureka = fakeSongGenerator(undefined, { name: "mureka", model: "mureka-9" });

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "lyria", fallbackProvider: null },
      });
      await expect(dispatcher.execute()).rejects.toThrow();

      expect(mureka.submitGeneration).not.toHaveBeenCalled();
      const persisted = await songRepository.findById(song.id);
      expect(persisted?.status).toBe(SongStatus.FAILED);
      expect(persisted?.provider).toBe("lyria");
    });

    it("does not fall back on an ambiguous network failure — the primary may already be generating a paid song", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(
        new ExternalApiError("timeout", { code: "http_request_failed" }),
        { name: "mureka", model: "mureka-9" },
      );
      const lyria = fakeSongGenerator(undefined, { name: "lyria", model: "lyria-3.5" });

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "mureka", fallbackProvider: "lyria" },
      });
      await expect(dispatcher.execute()).rejects.toThrow();

      expect(lyria.submitGeneration).not.toHaveBeenCalled();
      expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
    });

    it.each([
      ["a rate limit", "mureka.rate_limited"],
      ["a server error", "mureka.server_error"],
      ["an invalid request", "mureka.invalid_request"],
      ["invalid credentials", "mureka.invalid_authentication"],
      ["a forbidden response", "mureka.forbidden"],
    ])("does not fall back on %s", async (_label, code) => {
      seedQueuedSong();
      const mureka = fakeSongGenerator(new ExternalApiError(code, { code }), {
        name: "mureka",
        model: "mureka-9",
      });
      const lyria = fakeSongGenerator(undefined, { name: "lyria", model: "lyria-3.5" });

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "mureka", fallbackProvider: "lyria" },
      });
      await expect(dispatcher.execute()).rejects.toThrow();

      expect(lyria.submitGeneration).not.toHaveBeenCalled();
    });

    it("attempts at most one fallback: a failing fallback fails the song instead of chaining", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(quotaExceeded(), { name: "mureka", model: "mureka-9" });
      const lyria = fakeSongGenerator(lyriaQuotaExceeded(), {
        name: "lyria",
        model: "lyria-3.5",
      });

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "mureka", fallbackProvider: "lyria" },
      });
      await expect(dispatcher.execute()).rejects.toThrow();

      expect(mureka.submitGeneration).toHaveBeenCalledTimes(1);
      expect(lyria.submitGeneration).toHaveBeenCalledTimes(1);
      expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
    });

    it("does not fall back when post-processing fails after the provider already generated the audio", async () => {
      const song = seedQueuedSong();
      const lyria = fakeSongGenerator(immediateSubmission(), {
        name: "lyria",
        model: "lyria-3.5",
      });
      const mureka = fakeSongGenerator(undefined, { name: "mureka", model: "mureka-9" });
      // Stands in for an FFmpeg or R2 failure: the audio exists and has been
      // paid for, so regenerating anywhere would pay twice.
      const failingCompletion = {
        complete: vi.fn(async (failing: Song) => {
          failing.markFailed("ffmpeg exited with code 1");
          await songRepository.update(failing);
          throw new Error("ffmpeg exited with code 1");
        }),
      } as unknown as SongCompletionService;

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "lyria", fallbackProvider: "mureka" },
        completionService: failingCompletion,
      });
      await expect(dispatcher.execute()).rejects.toThrow("ffmpeg");

      expect(mureka.submitGeneration).not.toHaveBeenCalled();
      const persisted = await songRepository.findById(song.id);
      expect(persisted?.status).toBe(SongStatus.FAILED);
      expect(persisted?.provider).toBe("lyria");
    });

    it("raises a controlled error when the configured provider has no adapter registered", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(undefined, { name: "mureka", model: "mureka-9" });

      const dispatcher = buildDispatcher({
        providers: [mureka],
        routing: { primaryProvider: "lyria", fallbackProvider: null },
      });

      await expect(dispatcher.execute()).rejects.toMatchObject({
        code: "song.unknown_provider",
      });
      expect(mureka.submitGeneration).not.toHaveBeenCalled();
      expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
    });

    it("keeps the single-concurrency guarantee: a song already GENERATING blocks any routing", async () => {
      seedStuckGeneratingSong(1);
      const queued = seedQueuedSong();
      const lyria = fakeSongGenerator(immediateSubmission(), {
        name: "lyria",
        model: "lyria-3.5",
      });

      const dispatcher = buildDispatcher({
        providers: [lyria],
        routing: { primaryProvider: "lyria", fallbackProvider: null },
      });
      const result = await dispatcher.execute();

      expect(result).toBeNull();
      expect(lyria.submitGeneration).not.toHaveBeenCalled();
      expect((await songRepository.findById(queued.id))?.status).toBe(SongStatus.QUEUED);
    });

    it("leaves an already-submitted song bound to its own provider when the routing changes afterwards", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(undefined, { name: "mureka", model: "mureka-9" });
      const lyria = fakeSongGenerator(immediateSubmission(), {
        name: "lyria",
        model: "lyria-3.5",
      });

      // Dispatched while Mureka was primary.
      await buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "mureka", fallbackProvider: "lyria" },
      }).execute();
      expect((await songRepository.findById(song.id))?.provider).toBe("mureka");

      // The admin then flips the routing. The in-flight song is untouched:
      // the dispatcher does not even look at it (it is GENERATING), and its
      // provider still names Mureka for the poller to resolve.
      const afterSwitch = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "lyria", fallbackProvider: "mureka" },
      });
      expect(await afterSwitch.execute()).toBeNull();

      const persisted = await songRepository.findById(song.id);
      expect(persisted?.provider).toBe("mureka");
      expect(persisted?.providerModel).toBe("mureka-9");
      expect(lyria.submitGeneration).not.toHaveBeenCalled();
    });
  });

  /**
   * Diagnosing a failed submission.
   *
   * Song `9a2cedaf` failed on 2026-09-30 with `providerError` reading only
   * "Request to https://api.mureka.ai/v1/song/generate failed after 1
   * attempt(s)". That sentence is `httpRequest`'s wrapper; the real error —
   * a timeout, a DNS failure, a reset — sits in `cause` and was discarded,
   * which made those outcomes indistinguishable afterwards. These tests
   * hold the cause in place. They change no behaviour: the song still
   * fails, is still not retried, and is still not handed to the fallback.
   */
  describe("GenerationDispatcher — the root cause of a failed submission", () => {
    function timeoutLikeMurekaFailure(): ExternalApiError {
      const cause = new Error("The operation was aborted due to timeout");
      cause.name = "TimeoutError";
      return new ExternalApiError(
        "Request to https://api.mureka.ai/v1/song/generate failed after 1 attempt(s)",
        { code: "http_request_failed", cause },
      );
    }

    it("records the underlying network error alongside our own message", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(timeoutLikeMurekaFailure(), {
        name: "mureka",
        model: "mureka-9",
      });

      const dispatcher = buildDispatcher({ providers: [mureka] });
      await expect(dispatcher.execute()).rejects.toThrow();

      const persisted = await songRepository.findById(song.id);
      const stored = persisted?.providerError ?? "";

      expect(stored).toContain("failed after 1 attempt(s)");
      // The part that was missing, and the reason this incident could not
      // be diagnosed from the record alone.
      expect(stored).toContain("TimeoutError");
      expect(stored).toContain("aborted due to timeout");
    });

    it("still fails the song and still does not fall back — behaviour is unchanged", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(timeoutLikeMurekaFailure(), {
        name: "mureka",
        model: "mureka-9",
      });
      const lyria = fakeSongGenerator(undefined, { name: "lyria", model: "lyria-3.5" });

      const dispatcher = buildDispatcher({
        providers: [mureka, lyria],
        routing: { primaryProvider: "mureka", fallbackProvider: "lyria" },
      });
      await expect(dispatcher.execute()).rejects.toThrow();

      // A timeout may have started a billable generation, so the fallback
      // must not run — see `providerFallbackPolicy`.
      expect(lyria.submitGeneration).not.toHaveBeenCalled();
      expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
    });

    it("leaves the message alone when there is no underlying cause", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(
        new ExternalApiError("Mureka rejected the request.", { code: "mureka.api_error" }),
        { name: "mureka", model: "mureka-9" },
      );

      const dispatcher = buildDispatcher({ providers: [mureka] });
      await expect(dispatcher.execute()).rejects.toThrow();

      expect((await songRepository.findById(song.id))?.providerError).toBe(
        "Mureka rejected the request.",
      );
    });

    it("bounds what it stores, so a verbose cause cannot flood the column", async () => {
      const song = seedQueuedSong();
      const mureka = fakeSongGenerator(
        new ExternalApiError("Request failed.", {
          code: "http_request_failed",
          cause: new Error("x".repeat(5_000)),
        }),
        { name: "mureka", model: "mureka-9" },
      );

      const dispatcher = buildDispatcher({ providers: [mureka] });
      await expect(dispatcher.execute()).rejects.toThrow();

      expect(((await songRepository.findById(song.id))?.providerError ?? "").length).toBeLessThan(
        300,
      );
    });
  });
});
