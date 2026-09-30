import { describe, expect, it } from "vitest";
import { Song } from "@/domain/song/entities/Song";
import { SongStatus } from "@/domain/song/types";

/**
 * Social Sharing — the token behind a song's public page.
 *
 * What these tests protect is not that a token exists, but that it is
 * the *right kind* of value: independent of every identifier the system
 * already exposes, unguessable, and minted only once the song is
 * actually shareable.
 */

function completedSong(): Song {
  const song = Song.create({ leadId: "lead-1", lyricsId: "lyrics-1", moodId: "mood-1" });
  song.markGenerating();
  song.markCompleted({
    providerSongId: "provider-song-1",
    audioStorageKey: "songs/lead-1.mp3",
    duration: 60,
  });
  return song;
}

describe("Song.publicShareToken", () => {
  it("is not minted before the song completes — a queued song has nothing to share", () => {
    const song = Song.create({ leadId: "lead-1", lyricsId: "lyrics-1", moodId: "mood-1" });

    expect(song.publicShareToken).toBeNull();
    expect(song.isPubliclyShareable).toBe(false);
  });

  it("is minted when the song completes", () => {
    const song = completedSong();

    expect(song.publicShareToken).toMatch(/^[0-9a-f]{64}$/);
    expect(song.isPubliclyShareable).toBe(true);
  });

  it("is unique across songs", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => completedSong().publicShareToken));

    expect(tokens.size).toBe(50);
  });

  it("carries 256 bits of entropy, so it cannot be guessed or enumerated", () => {
    const token = completedSong().publicShareToken as string;

    // 32 random bytes rendered as hex.
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it("is not the song id, the lead id, or anything derived from them", () => {
    const song = completedSong();
    const token = song.publicShareToken as string;

    expect(token).not.toBe(song.id);
    expect(token).not.toContain(song.id);
    expect(token).not.toBe(song.leadId);
    expect(token).not.toContain(song.leadId);
    expect(token).not.toContain(song.lyricsId);
  });

  it("contains no personal information and no timestamp", () => {
    const song = completedSong();
    const token = song.publicShareToken as string;

    expect(token).not.toContain("lead-1");
    expect(token).not.toContain("songs/");
    // A hex string cannot carry a name or an email, and a completion
    // timestamp must not be recoverable from it either.
    expect(token).not.toContain(String(song.completedAt?.getFullYear()));
  });

  it("is not reused from anywhere — two songs for the same lead differ", () => {
    const first = completedSong();
    const second = completedSong();

    expect(first.leadId).toBe(second.leadId);
    expect(first.publicShareToken).not.toBe(second.publicShareToken);
  });

  it("survives a snapshot round-trip, so persistence carries it", () => {
    const song = completedSong();
    const restored = Song.fromPersistence({
      ...song.toSnapshot(),
      publicShareToken: song.publicShareToken,
    });

    expect(restored.publicShareToken).toBe(song.publicShareToken);
    expect(restored.isPubliclyShareable).toBe(true);
  });

  it("treats a cleared token as a revoked link, without touching the song", () => {
    const song = completedSong();
    const revoked = Song.fromPersistence({ ...song.toSnapshot(), publicShareToken: null });

    expect(revoked.isPubliclyShareable).toBe(false);
    // The song itself is untouched: still completed, still has its audio.
    expect(revoked.status).toBe(SongStatus.COMPLETED);
    expect(revoked.audioStorageKey).toBe("songs/lead-1.mp3");
  });

  it("is not shareable without stored audio, even when completed", () => {
    const song = completedSong();
    const noAudio = Song.fromPersistence({ ...song.toSnapshot(), audioStorageKey: null });

    expect(noAudio.isPubliclyShareable).toBe(false);
  });
});
