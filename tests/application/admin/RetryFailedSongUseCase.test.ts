import { beforeEach, describe, expect, it } from "vitest";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type {
  AuditLogRepository,
  AuditLogSearchFilter,
} from "@/domain/admin/repositories/AuditLogRepository";
import { RetryFailedSongUseCase } from "@/application/admin/use-cases/RetryFailedSongUseCase";

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
  public created: AuditLogEntry[] = [];
  async create(entry: AuditLogEntry): Promise<AuditLogEntry> {
    this.created.push(entry);
    return entry;
  }
  async findByEntity(entity: string, entityId: string): Promise<AuditLogEntry[]> {
    return this.created.filter((e) => e.entity === entity && e.entityId === entityId);
  }
  async findRecent(
    filter: AuditLogSearchFilter,
  ): Promise<{ items: AuditLogEntry[]; total: number }> {
    return { items: this.created.slice(0, filter.pageSize), total: this.created.length };
  }
}

function buildFailedSong(): Song {
  const song = Song.create({ leadId: "lead-1", lyricsId: "lyrics-1", moodId: "mood-1" });
  song.markGenerating();
  song.markFailed();
  return song;
}

describe("RetryFailedSongUseCase", () => {
  let songRepository: InMemorySongRepository;
  let auditLogRepository: InMemoryAuditLogRepository;

  beforeEach(() => {
    songRepository = new InMemorySongRepository();
    auditLogRepository = new InMemoryAuditLogRepository();
  });

  it("rejects an unknown song id", async () => {
    const useCase = new RetryFailedSongUseCase(songRepository, auditLogRepository);
    await expect(useCase.execute({ songId: "missing", adminId: "admin-1" })).rejects.toThrow();
  });

  it("resets a FAILED song back to QUEUED, without creating a new row", async () => {
    const song = buildFailedSong();
    songRepository.seed(song);
    const useCase = new RetryFailedSongUseCase(songRepository, auditLogRepository);

    const result = await useCase.execute({ songId: song.id, adminId: "admin-1" });

    expect(result.song.id).toBe(song.id);
    expect(result.song.status).toBe(SongStatus.QUEUED);

    const persisted = await songRepository.findById(song.id);
    expect(persisted?.id).toBe(song.id);
    expect(persisted?.status).toBe(SongStatus.QUEUED);
  });

  it("reuses the same lyricsId and moodId — it never touches them", async () => {
    const song = buildFailedSong();
    songRepository.seed(song);
    const useCase = new RetryFailedSongUseCase(songRepository, auditLogRepository);

    const result = await useCase.execute({ songId: song.id, adminId: "admin-1" });

    expect(result.song.lyricsId).toBe("lyrics-1");
    expect(result.song.moodId).toBe("mood-1");
  });

  it("records a retry_song audit entry attributed to the acting admin", async () => {
    const song = buildFailedSong();
    songRepository.seed(song);
    const useCase = new RetryFailedSongUseCase(songRepository, auditLogRepository);

    await useCase.execute({ songId: song.id, adminId: "admin-7" });

    expect(auditLogRepository.created).toHaveLength(1);
    expect(auditLogRepository.created[0]).toMatchObject({
      adminId: "admin-7",
      action: "retry_song",
      entity: "Song",
      entityId: song.id,
    });
  });

  it("rejects retrying a QUEUED song", async () => {
    const song = Song.create({ leadId: "lead-1", lyricsId: "lyrics-1", moodId: "mood-1" });
    songRepository.seed(song);
    const useCase = new RetryFailedSongUseCase(songRepository, auditLogRepository);

    await expect(useCase.execute({ songId: song.id, adminId: "admin-1" })).rejects.toThrow();
    expect(auditLogRepository.created).toHaveLength(0);
  });

  it("rejects retrying a GENERATING song", async () => {
    const song = Song.create({ leadId: "lead-1", lyricsId: "lyrics-1", moodId: "mood-1" });
    song.markGenerating();
    songRepository.seed(song);
    const useCase = new RetryFailedSongUseCase(songRepository, auditLogRepository);

    await expect(useCase.execute({ songId: song.id, adminId: "admin-1" })).rejects.toThrow();
    expect(auditLogRepository.created).toHaveLength(0);
  });

  it("rejects retrying an already-COMPLETED song", async () => {
    const song = Song.create({ leadId: "lead-1", lyricsId: "lyrics-1", moodId: "mood-1" });
    song.markGenerating();
    song.markCompleted({ providerSongId: "suno-1", audioStorageKey: "songs/song.mp3" });
    songRepository.seed(song);
    const useCase = new RetryFailedSongUseCase(songRepository, auditLogRepository);

    await expect(useCase.execute({ songId: song.id, adminId: "admin-1" })).rejects.toThrow();
    expect(auditLogRepository.created).toHaveLength(0);

    const persisted = await songRepository.findById(song.id);
    expect(persisted?.status).toBe(SongStatus.COMPLETED);
  });
});
