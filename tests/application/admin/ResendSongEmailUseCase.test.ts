import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import type { SongEmailSender } from "@/application/song/contracts/SongEmailSender";
import { ResendSongEmailUseCase } from "@/application/admin/use-cases/ResendSongEmailUseCase";

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
  async update(song: Song): Promise<Song> {
    this.records.set(song.id, song);
    return song;
  }
}

class InMemoryAuditLogRepository implements AuditLogRepository {
  public created: AuditLogEntry[] = [];
  async create(entry: AuditLogEntry): Promise<AuditLogEntry> {
    this.created.push(entry);
    return entry;
  }
  async findByEntity(entity: string, entityId: string): Promise<AuditLogEntry[]> {
    return this.created.filter((e) => e.entity === entity && e.entityId === entityId);
  }
}

function fakeEmailSender(): SongEmailSender {
  return { sendSongReadyEmail: vi.fn().mockResolvedValue(undefined) };
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

function buildCompletedEmailedSong(leadId: string): Song {
  const song = Song.create({ leadId, lyricsId: "lyrics-1", moodId: "mood-1" });
  song.markGenerating();
  song.markReady({
    providerSongId: "suno-1",
    audioUrl: "https://cdn.example.com/song.mp3",
    duration: 120,
  });
  return song;
}

describe("ResendSongEmailUseCase", () => {
  let leadRepository: InMemoryLeadRepository;
  let songRepository: InMemorySongRepository;
  let auditLogRepository: InMemoryAuditLogRepository;
  let lead: Lead;

  beforeEach(() => {
    leadRepository = new InMemoryLeadRepository();
    songRepository = new InMemorySongRepository();
    auditLogRepository = new InMemoryAuditLogRepository();
    lead = createLead();
    leadRepository.seed(lead);
  });

  it("rejects an unknown song id", async () => {
    const useCase = new ResendSongEmailUseCase(
      songRepository,
      leadRepository,
      fakeEmailSender(),
      auditLogRepository,
    );

    await expect(
      useCase.execute({ songId: "missing", adminId: "admin-1", reason: "test" }),
    ).rejects.toThrow();
  });

  it("resends the email and records Resent By / Resent At / Reason in the audit trail", async () => {
    const song = buildCompletedEmailedSong(lead.id);
    // The domain entity has no setter for `emailedAt` (it's written only
    // by `PrismaEmailDeliveryTracker`'s atomic claim), so rehydrate a
    // song whose `emailedAt` is already set — exactly what the
    // repository would return after the automatic send actually ran.
    const emailedSong = Song.fromPersistence({ ...song.toSnapshot(), emailedAt: new Date() });
    songRepository.seed(emailedSong);

    const emailSender = fakeEmailSender();
    const useCase = new ResendSongEmailUseCase(
      songRepository,
      leadRepository,
      emailSender,
      auditLogRepository,
    );

    const result = await useCase.execute({
      songId: emailedSong.id,
      adminId: "admin-9",
      reason: "Parent said they never received it.",
    });

    expect(result.success).toBe(true);
    expect(emailSender.sendSongReadyEmail).toHaveBeenCalledTimes(1);
    expect(emailSender.sendSongReadyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        audioUrl: "https://cdn.example.com/song.mp3",
      }),
    );

    expect(auditLogRepository.created).toHaveLength(1);
    expect(auditLogRepository.created[0]).toMatchObject({
      adminId: "admin-9",
      action: "resend_email",
      entity: "Song",
      entityId: emailedSong.id,
      metadata: { reason: "Parent said they never received it." },
    });
  });

  it("rejects resending when the song is not COMPLETED", async () => {
    const song = Song.create({ leadId: lead.id, lyricsId: "lyrics-1", moodId: "mood-1" });
    song.markGenerating();
    song.markFailed();
    songRepository.seed(song);

    const emailSender = fakeEmailSender();
    const useCase = new ResendSongEmailUseCase(
      songRepository,
      leadRepository,
      emailSender,
      auditLogRepository,
    );

    await expect(
      useCase.execute({ songId: song.id, adminId: "admin-1", reason: "test" }),
    ).rejects.toThrow();
    expect(emailSender.sendSongReadyEmail).not.toHaveBeenCalled();
  });

  it("rejects resending when the automatic email was never sent (emailedAt is null)", async () => {
    const song = buildCompletedEmailedSong(lead.id);
    songRepository.seed(song);

    const emailSender = fakeEmailSender();
    const useCase = new ResendSongEmailUseCase(
      songRepository,
      leadRepository,
      emailSender,
      auditLogRepository,
    );

    await expect(
      useCase.execute({ songId: song.id, adminId: "admin-1", reason: "test" }),
    ).rejects.toThrow();
    expect(emailSender.sendSongReadyEmail).not.toHaveBeenCalled();
    expect(auditLogRepository.created).toHaveLength(0);
  });

  it("never touches EmailDeliveryTracker's automatic-delivery claim (no such dependency exists on this use case)", () => {
    // Structural guarantee: ResendSongEmailUseCase's constructor has no
    // EmailDeliveryTracker parameter, so it is architecturally impossible
    // for a manual resend to interact with the automatic-delivery claim.
    expect(ResendSongEmailUseCase.length).toBe(4);
  });
});
