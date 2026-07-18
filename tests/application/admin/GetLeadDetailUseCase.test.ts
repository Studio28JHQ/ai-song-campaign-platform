import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import type {
  AuditLogRepository,
  AuditLogSearchFilter,
} from "@/domain/admin/repositories/AuditLogRepository";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AudioUrlResolver } from "@/application/song/contracts/AudioUrlResolver";
import { GetLeadDetailUseCase } from "@/application/admin/use-cases/GetLeadDetailUseCase";
import type { ExecutionHistoryItem } from "@/application/admin/dto/ExecutionHistoryItem";

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

class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly records: AuditLogEntry[] = [];
  async create(entry: AuditLogEntry): Promise<AuditLogEntry> {
    this.records.push(entry);
    return entry;
  }
  async findByEntity(entity: string, entityId: string): Promise<AuditLogEntry[]> {
    return this.records.filter((r) => r.entity === entity && r.entityId === entityId);
  }
  async findRecent(
    filter: AuditLogSearchFilter,
  ): Promise<{ items: AuditLogEntry[]; total: number }> {
    return { items: this.records.slice(0, filter.pageSize), total: this.records.length };
  }
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

function findEvent(
  history: ExecutionHistoryItem[],
  type: ExecutionHistoryItem["type"],
): ExecutionHistoryItem | undefined {
  return history.find((item) => item.type === type);
}

describe("GetLeadDetailUseCase", () => {
  let leadRepository: InMemoryLeadRepository;
  let lyricsRepository: InMemoryLyricsRepository;
  let songRepository: InMemorySongRepository;
  let auditLogRepository: InMemoryAuditLogRepository;

  beforeEach(() => {
    leadRepository = new InMemoryLeadRepository();
    lyricsRepository = new InMemoryLyricsRepository();
    songRepository = new InMemorySongRepository();
    auditLogRepository = new InMemoryAuditLogRepository();
  });

  it("rejects an unknown lead", async () => {
    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );

    await expect(
      useCase.execute({ leadId: "missing", viewingAdminId: "admin-1" }),
    ).rejects.toThrow();
  });

  it("composes lead, lyrics history, approved lyrics, and song from existing repositories", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const v1 = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\nVerse 1",
      version: 1,
      parentMessage: "A gentle song about bedtime.",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
    });
    const v2 = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "New Title\nVerse 1",
      version: 2,
      parentMessage: "A gentle song about bedtime.",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
    });
    v2.approve();
    lyricsRepository.seed(v1);
    lyricsRepository.seed(v2);

    const song = Song.create({ leadId: lead.id, lyricsId: v2.id, moodId: "mood-1" });
    songRepository.seed(song);

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-1" });

    expect(result.lead.id).toBe(lead.id);
    expect(result.lyricsHistory).toHaveLength(2);
    expect(result.approvedLyrics?.id).toBe(v2.id);
    expect(result.song?.id).toBe(song.id);
  });

  it("returns null approvedLyrics/song when neither exists yet", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-1" });

    expect(result.approvedLyrics).toBeNull();
    expect(result.song).toBeNull();
    expect(result.lyricsHistory).toEqual([]);
  });

  it("records a view_lead audit entry for the viewing admin, and surfaces it as a lead_viewed event", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-42" });

    const viewed = findEvent(result.executionHistory, "lead_viewed");
    expect(viewed).toMatchObject({ actor: "admin-42", label: "Ficha consultada" });
  });

  it("includes a lead_created event using the lead's own createdAt", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-1" });

    const created = findEvent(result.executionHistory, "lead_created");
    expect(created).toMatchObject({ actor: null, timestamp: lead.createdAt });
  });

  it("includes lyrics_generated and lyrics_approved events only for the approved version", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const v1 = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\nVerse 1",
      version: 1,
      parentMessage: "A gentle song about bedtime.",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
    });
    const v2 = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "New Title\nVerse 1",
      version: 2,
      parentMessage: "A gentle song about bedtime.",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
    });
    v2.approve();
    lyricsRepository.seed(v1);
    lyricsRepository.seed(v2);

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-1" });

    const generatedEvents = result.executionHistory.filter((e) => e.type === "lyrics_generated");
    const approvedEvents = result.executionHistory.filter((e) => e.type === "lyrics_approved");

    expect(generatedEvents).toHaveLength(2);
    expect(approvedEvents).toHaveLength(1);
    expect(approvedEvents[0].label).toContain("v2");
  });

  it("includes song_requested and song_completed events for a COMPLETED song, but not song_failed", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const lyrics = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\nVerse 1",
      version: 1,
      parentMessage: "A gentle song about bedtime.",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
    });
    lyrics.approve();
    lyricsRepository.seed(lyrics);

    const song = Song.create({ leadId: lead.id, lyricsId: lyrics.id, moodId: "mood-1" });
    song.markGenerating();
    song.markCompleted({ providerSongId: "suno-1", audioStorageKey: "songs/song.mp3" });
    songRepository.seed(song);

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-1" });

    expect(findEvent(result.executionHistory, "song_requested")).toMatchObject({
      timestamp: song.createdAt,
    });
    expect(findEvent(result.executionHistory, "song_completed")).toMatchObject({
      timestamp: song.generatedAt,
    });
    expect(findEvent(result.executionHistory, "song_failed")).toBeUndefined();
  });

  it("includes a song_failed event (and not song_completed) for a currently-FAILED song", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const lyrics = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\nVerse 1",
      version: 1,
      parentMessage: "A gentle song about bedtime.",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
    });
    lyrics.approve();
    lyricsRepository.seed(lyrics);

    const song = Song.create({ leadId: lead.id, lyricsId: lyrics.id, moodId: "mood-1" });
    song.markGenerating();
    song.markFailed();
    songRepository.seed(song);

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-1" });

    expect(findEvent(result.executionHistory, "song_failed")).toBeDefined();
    expect(findEvent(result.executionHistory, "song_completed")).toBeUndefined();
  });

  it("includes an email_sent_automatic event only once the song has an emailedAt timestamp", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const lyrics = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\nVerse 1",
      version: 1,
      parentMessage: "A gentle song about bedtime.",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
    });
    lyrics.approve();
    lyricsRepository.seed(lyrics);

    const song = Song.create({ leadId: lead.id, lyricsId: lyrics.id, moodId: "mood-1" });
    song.markGenerating();
    song.markCompleted({ providerSongId: "suno-1", audioStorageKey: "songs/song.mp3" });
    songRepository.seed(song);

    const useCaseBeforeEmail = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );
    const beforeEmail = await useCaseBeforeEmail.execute({
      leadId: lead.id,
      viewingAdminId: "admin-1",
    });
    expect(findEvent(beforeEmail.executionHistory, "email_sent_automatic")).toBeUndefined();
  });

  it("includes song_retried and email_resent_manual events sourced from real audit entries, with the reason attached", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const lyrics = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\nVerse 1",
      version: 1,
      parentMessage: "A gentle song about bedtime.",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
    });
    lyrics.approve();
    lyricsRepository.seed(lyrics);

    const song = Song.create({ leadId: lead.id, lyricsId: lyrics.id, moodId: "mood-1" });
    song.markGenerating();
    song.markCompleted({ providerSongId: "suno-1", audioStorageKey: "songs/song.mp3" });
    songRepository.seed(song);

    await auditLogRepository.create(
      AuditLogEntry.create({
        adminId: "admin-7",
        action: "retry_song",
        entity: "Song",
        entityId: song.id,
      }),
    );
    await auditLogRepository.create(
      AuditLogEntry.create({
        adminId: "admin-8",
        action: "resend_email",
        entity: "Song",
        entityId: song.id,
        metadata: { reason: "Parent said they never received it." },
      }),
    );

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-1" });

    expect(findEvent(result.executionHistory, "song_retried")).toMatchObject({ actor: "admin-7" });
    expect(findEvent(result.executionHistory, "email_resent_manual")).toMatchObject({
      actor: "admin-8",
      detail: "Parent said they never received it.",
    });
  });

  it("sorts the execution history newest first", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const lyrics = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\nVerse 1",
      version: 1,
      parentMessage: "A gentle song about bedtime.",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      voice: "FEMALE",
    });
    lyrics.approve();
    lyricsRepository.seed(lyrics);

    const song = Song.create({ leadId: lead.id, lyricsId: lyrics.id, moodId: "mood-1" });
    song.markGenerating();
    song.markCompleted({ providerSongId: "suno-1", audioStorageKey: "songs/song.mp3" });
    songRepository.seed(song);

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
      fakeAudioUrlResolver(),
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-1" });

    const timestamps = result.executionHistory.map((item) => item.timestamp.getTime());
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
  });
});
