import { beforeEach, describe, expect, it } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import { GetLeadDetailUseCase } from "@/application/admin/use-cases/GetLeadDetailUseCase";

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
  async update(song: Song): Promise<Song> {
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
    });
    const v2 = Lyrics.create({
      leadId: lead.id,
      moodId: "mood-1",
      prompt: "prompt",
      content: "New Title\nVerse 1",
      version: 2,
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
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-1" });

    expect(result.approvedLyrics).toBeNull();
    expect(result.song).toBeNull();
    expect(result.lyricsHistory).toEqual([]);
  });

  it("records a view_lead audit entry for the viewing admin, and returns it in the audit history", async () => {
    const lead = createLead();
    leadRepository.seed(lead);

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-42" });

    expect(result.auditHistory).toHaveLength(1);
    expect(result.auditHistory[0]).toMatchObject({
      adminId: "admin-42",
      action: "view_lead",
      entity: "Lead",
      entityId: lead.id,
    });
  });

  it("includes prior audit entries for this lead alongside the new view entry", async () => {
    const lead = createLead();
    leadRepository.seed(lead);
    await auditLogRepository.create(
      AuditLogEntry.create({
        adminId: "admin-1",
        action: "view_lead",
        entity: "Lead",
        entityId: lead.id,
      }),
    );

    const useCase = new GetLeadDetailUseCase(
      leadRepository,
      lyricsRepository,
      songRepository,
      auditLogRepository,
    );

    const result = await useCase.execute({ leadId: lead.id, viewingAdminId: "admin-2" });

    expect(result.auditHistory).toHaveLength(2);
  });
});
