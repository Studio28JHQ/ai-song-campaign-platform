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
    expect(song.providerTaskId).toBeNull();
    expect(song.providerTraceId).toBeNull();
    expect(song.providerStatus).toBeNull();
    expect(song.providerError).toBeNull();
    expect(song.audioStorageKey).toBeNull();
    expect(song.duration).toBeNull();
    expect(song.submittedAt).toBeNull();
    expect(song.generatedAt).toBeNull();
    expect(song.completedAt).toBeNull();
    expect(song.id).toBeTruthy();
  });

  it("rejects a missing leadId", () => {
    expect(() => Song.create({ ...validInput, leadId: "  " })).toThrow();
  });

  it("rejects a missing lyricsId", () => {
    expect(() => Song.create({ ...validInput, lyricsId: "" })).toThrow();
  });
});

describe("Song.recordSubmission (Sprint 9.1)", () => {
  it("records provider task/trace ids and submittedAt while GENERATING", () => {
    const song = Song.create(validInput);
    song.markGenerating();

    song.recordSubmission({ providerTaskId: "task-1", providerTraceId: "trace-1" });

    expect(song.providerTaskId).toBe("task-1");
    expect(song.providerTraceId).toBe("trace-1");
    expect(song.providerStatus).toBe("submitted");
    expect(song.submittedAt).not.toBeNull();
    expect(song.status).toBe(SongStatus.GENERATING);
  });

  it("defaults providerTraceId to null when not provided", () => {
    const song = Song.create(validInput);
    song.markGenerating();

    song.recordSubmission({ providerTaskId: "task-1" });

    expect(song.providerTraceId).toBeNull();
  });

  it("rejects recording a submission outside GENERATING", () => {
    const song = Song.create(validInput);
    expect(() => song.recordSubmission({ providerTaskId: "task-1" })).toThrow();
  });

  it("rejects an empty providerTaskId", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    expect(() => song.recordSubmission({ providerTaskId: "" })).toThrow();
  });
});

describe("Song status transitions", () => {
  it("allows QUEUED -> GENERATING -> COMPLETED", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.recordSubmission({ providerTaskId: "task-1" });
    expect(song.status).toBe(SongStatus.GENERATING);

    song.markCompleted({
      providerSongId: "suno-123",
      audioStorageKey: "songs/song-1.mp3",
      duration: 120,
    });
    expect(song.status).toBe(SongStatus.COMPLETED);
    expect(song.providerSongId).toBe("suno-123");
    expect(song.audioStorageKey).toBe("songs/song-1.mp3");
    expect(song.duration).toBe(120);
    expect(song.providerStatus).toBe("completed");
    expect(song.generatedAt).not.toBeNull();
    expect(song.completedAt).not.toBeNull();
  });

  it("allows QUEUED -> GENERATING -> FAILED -> GENERATING (retry)", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.markFailed();
    expect(song.status).toBe(SongStatus.FAILED);

    song.markGenerating();
    expect(song.status).toBe(SongStatus.GENERATING);
  });

  it("records the failure reason and providerStatus on markFailed", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.markFailed("Provider returned a 500.");

    expect(song.providerStatus).toBe("failed");
    expect(song.providerError).toBe("Provider returned a 500.");
    expect(song.completedAt).not.toBeNull();
  });

  it("allows an admin retry to reset FAILED back to QUEUED, then resume normally", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.markFailed();
    expect(song.status).toBe(SongStatus.FAILED);

    song.retryFromFailure();
    expect(song.status).toBe(SongStatus.QUEUED);

    song.markGenerating();
    song.markCompleted({ providerSongId: "id", audioStorageKey: "songs/a.mp3" });
    expect(song.status).toBe(SongStatus.COMPLETED);
  });

  it("clears every provider-submission field on retryFromFailure (Sprint 9.1)", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.recordSubmission({ providerTaskId: "task-1", providerTraceId: "trace-1" });
    song.markFailed("timeout");

    song.retryFromFailure();

    expect(song.providerTaskId).toBeNull();
    expect(song.providerTraceId).toBeNull();
    expect(song.providerStatus).toBeNull();
    expect(song.providerError).toBeNull();
    expect(song.submittedAt).toBeNull();
    expect(song.completedAt).toBeNull();
  });

  it("rejects retryFromFailure from any status other than FAILED", () => {
    const queued = Song.create(validInput);
    expect(() => queued.retryFromFailure()).toThrow();

    const generating = Song.create(validInput);
    generating.markGenerating();
    expect(() => generating.retryFromFailure()).toThrow();

    const completed = Song.create(validInput);
    completed.markGenerating();
    completed.markCompleted({ providerSongId: "id", audioStorageKey: "songs/a.mp3" });
    expect(() => completed.retryFromFailure()).toThrow();
  });

  it("rejects skipping straight to COMPLETED", () => {
    const song = Song.create(validInput);
    expect(() =>
      song.markCompleted({ providerSongId: "id", audioStorageKey: "songs/a.mp3" }),
    ).toThrow();
  });

  it("rejects any transition out of COMPLETED (terminal)", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.markCompleted({ providerSongId: "id", audioStorageKey: "songs/a.mp3" });

    expect(() => song.markGenerating()).toThrow();
    expect(() => song.markFailed()).toThrow();
  });

  it("rejects markCompleted with an empty providerSongId or audioStorageKey", () => {
    const song = Song.create(validInput);
    song.markGenerating();

    expect(() =>
      song.markCompleted({ providerSongId: "", audioStorageKey: "songs/a.mp3" }),
    ).toThrow();
    expect(() => song.markCompleted({ providerSongId: "id", audioStorageKey: "" })).toThrow();
  });

  it("defaults duration to null when not provided", () => {
    const song = Song.create(validInput);
    song.markGenerating();
    song.markCompleted({ providerSongId: "id", audioStorageKey: "songs/a.mp3" });

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
      providerTaskId: song.providerTaskId,
      providerTraceId: song.providerTraceId,
      providerStatus: song.providerStatus,
      providerError: song.providerError,
      audioStorageKey: song.audioStorageKey,
      duration: song.duration,
      status: song.status,
      submittedAt: song.submittedAt,
      generatedAt: song.generatedAt,
      completedAt: song.completedAt,
      emailedAt: song.emailedAt,
      createdAt: song.createdAt,
      updatedAt: song.updatedAt,
    });

    expect(rehydrated.toSnapshot()).toEqual(song.toSnapshot());
  });
});
