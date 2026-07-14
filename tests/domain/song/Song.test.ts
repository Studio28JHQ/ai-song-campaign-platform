import { describe, expect, it } from "vitest";
import { Song } from "@/domain/song/entities/Song";
import { SongStatus } from "@/domain/song/types";

const validInput = { leadId: "lead-1", lyricsId: "lyrics-1", moodId: "mood-1" };

describe("Song.create", () => {
  it("creates a queued song with the default provider", () => {
    const song = Song.create(validInput);

    expect(song.status).toBe(SongStatus.QUEUED);
    expect(song.provider).toBe("suno");
    expect(song.providerSongId).toBeNull();
    expect(song.audioUrl).toBeNull();
    expect(song.duration).toBeNull();
    expect(song.generatedAt).toBeNull();
    expect(song.id).toBeTruthy();
  });

  it("rejects a missing leadId", () => {
    expect(() => Song.create({ ...validInput, leadId: "  " })).toThrow();
  });

  it("rejects a missing lyricsId", () => {
    expect(() => Song.create({ ...validInput, lyricsId: "" })).toThrow();
  });
});

describe("Song status transitions", () => {
  it("allows QUEUED -> GENERATING -> COMPLETED", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    expect(song.status).toBe(SongStatus.GENERATING);

    song.markCompleted({
      providerSongId: "suno-123",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });
    expect(song.status).toBe(SongStatus.COMPLETED);
    expect(song.providerSongId).toBe("suno-123");
    expect(song.audioUrl).toBe("https://cdn.example.com/song.mp3");
    expect(song.duration).toBe(120);
    expect(song.generatedAt).not.toBeNull();
  });

  it("allows QUEUED -> GENERATING -> FAILED -> GENERATING (retry)", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.markFailed();
    expect(song.status).toBe(SongStatus.FAILED);

    song.markGenerating();
    expect(song.status).toBe(SongStatus.GENERATING);
  });

  it("allows an admin retry to reset FAILED back to QUEUED, then resume normally", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.markFailed();
    expect(song.status).toBe(SongStatus.FAILED);

    song.retryFromFailure();
    expect(song.status).toBe(SongStatus.QUEUED);

    song.markGenerating();
    song.markCompleted({ providerSongId: "id", audioUrl: "https://cdn.example.com/a.mp3" });
    expect(song.status).toBe(SongStatus.COMPLETED);
  });

  it("rejects retryFromFailure from any status other than FAILED", () => {
    const queued = Song.create(validInput);
    expect(() => queued.retryFromFailure()).toThrow();

    const generating = Song.create(validInput);
    generating.markGenerating();
    expect(() => generating.retryFromFailure()).toThrow();

    const completed = Song.create(validInput);
    completed.markGenerating();
    completed.markCompleted({ providerSongId: "id", audioUrl: "https://cdn.example.com/a.mp3" });
    expect(() => completed.retryFromFailure()).toThrow();
  });

  it("rejects skipping straight to COMPLETED", () => {
    const song = Song.create(validInput);
    expect(() =>
      song.markCompleted({ providerSongId: "id", audioUrl: "https://cdn.example.com/a.mp3" }),
    ).toThrow();
  });

  it("rejects any transition out of COMPLETED (terminal)", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.markCompleted({ providerSongId: "id", audioUrl: "https://cdn.example.com/a.mp3" });

    expect(() => song.markGenerating()).toThrow();
    expect(() => song.markFailed()).toThrow();
  });

  it("rejects markCompleted with an empty providerSongId or audioUrl", () => {
    const song = Song.create(validInput);
    song.markGenerating();

    expect(() =>
      song.markCompleted({ providerSongId: "", audioUrl: "https://cdn.example.com/a.mp3" }),
    ).toThrow();
    expect(() => song.markCompleted({ providerSongId: "id", audioUrl: "" })).toThrow();
  });

  it("defaults duration to null when not provided", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.markCompleted({ providerSongId: "id", audioUrl: "https://cdn.example.com/a.mp3" });

    expect(song.duration).toBeNull();
  });
});

describe("Song.fromPersistence / toSnapshot", () => {
  it("round-trips through a snapshot", () => {
    const song = Song.create(validInput);
    const rehydrated = Song.fromPersistence({
      id: song.id,
      leadId: song.leadId,
      lyricsId: song.lyricsId,
      moodId: song.moodId,
      provider: song.provider,
      providerSongId: song.providerSongId,
      audioUrl: song.audioUrl,
      duration: song.duration,
      status: song.status,
      generatedAt: song.generatedAt,
      emailedAt: song.emailedAt,
      createdAt: song.createdAt,
      updatedAt: song.updatedAt,
    });

    expect(rehydrated.toSnapshot()).toEqual(song.toSnapshot());
  });
});
