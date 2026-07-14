import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import { ProcessSongGenerationUseCase } from "@/application/song/use-cases/ProcessSongGenerationUseCase";
import type { MoodSunoPromptProvider } from "@/application/song/contracts/MoodSunoPromptProvider";
import type {
  SunoGenerationResult,
  SunoGenerator,
} from "@/application/song/contracts/SunoGenerator";

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

function fakeMoodProvider(
  details: { name: string; sunoPrompt: string } | null = {
    name: "Joyful",
    sunoPrompt: "upbeat joyful lullaby",
  },
): MoodSunoPromptProvider {
  return { getMoodDetails: vi.fn().mockResolvedValue(details) };
}

function fakeSunoGenerator(
  result: SunoGenerationResult | Error = {
    providerSongId: "suno-123",
    audioUrl: "https://cdn.example.com/song.mp3",
    duration: 120,
  },
): SunoGenerator {
  return {
    generateSong:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
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

describe("ProcessSongGenerationUseCase", () => {
  let lyricsRepository: InMemoryLyricsRepository;
  let songRepository: InMemorySongRepository;

  beforeEach(() => {
    lyricsRepository = new InMemoryLyricsRepository();
    songRepository = new InMemorySongRepository();
  });

  it("rejects an unknown song id", async () => {
    const useCase = new ProcessSongGenerationUseCase(
      songRepository,
      lyricsRepository,
      fakeMoodProvider(),
      fakeSunoGenerator(),
    );

    await expect(useCase.execute({ songId: "missing" })).rejects.toThrow();
  });

  it("moves a PENDING song through GENERATING to READY on success, making exactly one Suno request", async () => {
    const lyrics = createApprovedLyrics();
    lyricsRepository.seed(lyrics);
    const song = Song.create({ leadId: "lead-1", lyricsId: lyrics.id, moodId: lyrics.moodId });
    songRepository.seed(song);

    const suno = fakeSunoGenerator();
    const useCase = new ProcessSongGenerationUseCase(
      songRepository,
      lyricsRepository,
      fakeMoodProvider(),
      suno,
    );

    const response = await useCase.execute({ songId: song.id });

    expect(response.song.status).toBe(SongStatus.READY);
    expect(response.song.audioUrl).toBe("https://cdn.example.com/song.mp3");
    expect(suno.generateSong).toHaveBeenCalledTimes(1);

    const persisted = await songRepository.findById(song.id);
    expect(persisted?.status).toBe(SongStatus.READY);
  });

  it("marks the song FAILED and re-throws on a Suno failure", async () => {
    const lyrics = createApprovedLyrics();
    lyricsRepository.seed(lyrics);
    const song = Song.create({ leadId: "lead-1", lyricsId: lyrics.id, moodId: lyrics.moodId });
    songRepository.seed(song);

    const useCase = new ProcessSongGenerationUseCase(
      songRepository,
      lyricsRepository,
      fakeMoodProvider(),
      fakeSunoGenerator(new Error("Suno API responded with status 503.")),
    );

    await expect(useCase.execute({ songId: song.id })).rejects.toThrow();

    const persisted = await songRepository.findById(song.id);
    expect(persisted?.status).toBe(SongStatus.FAILED);
  });

  it("marks the song FAILED when the approved lyrics can no longer be found", async () => {
    const song = Song.create({ leadId: "lead-1", lyricsId: "missing-lyrics", moodId: "mood-1" });
    songRepository.seed(song);

    const useCase = new ProcessSongGenerationUseCase(
      songRepository,
      lyricsRepository,
      fakeMoodProvider(),
      fakeSunoGenerator(),
    );

    await expect(useCase.execute({ songId: song.id })).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
  });

  it("marks the song FAILED when the mood can no longer be found", async () => {
    const lyrics = createApprovedLyrics();
    lyricsRepository.seed(lyrics);
    const song = Song.create({ leadId: "lead-1", lyricsId: lyrics.id, moodId: lyrics.moodId });
    songRepository.seed(song);

    const useCase = new ProcessSongGenerationUseCase(
      songRepository,
      lyricsRepository,
      fakeMoodProvider(null),
      fakeSunoGenerator(),
    );

    await expect(useCase.execute({ songId: song.id })).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);
  });

  it("allows retrying the same song after a failure, succeeding on the second attempt", async () => {
    const lyrics = createApprovedLyrics();
    lyricsRepository.seed(lyrics);
    const song = Song.create({ leadId: "lead-1", lyricsId: lyrics.id, moodId: lyrics.moodId });
    songRepository.seed(song);

    const failingUseCase = new ProcessSongGenerationUseCase(
      songRepository,
      lyricsRepository,
      fakeMoodProvider(),
      fakeSunoGenerator(new Error("timeout")),
    );
    await expect(failingUseCase.execute({ songId: song.id })).rejects.toThrow();
    expect((await songRepository.findById(song.id))?.status).toBe(SongStatus.FAILED);

    const succeedingUseCase = new ProcessSongGenerationUseCase(
      songRepository,
      lyricsRepository,
      fakeMoodProvider(),
      fakeSunoGenerator(),
    );
    const response = await succeedingUseCase.execute({ songId: song.id });

    expect(response.song.status).toBe(SongStatus.READY);
    expect(response.song.id).toBe(song.id);
  });
});
