import { describe, expect, it } from "vitest";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { CreateLyricsInput } from "@/domain/lyrics/types";

const validInput: CreateLyricsInput = {
  leadId: "lead-1",
  moodId: "mood-1",
  prompt: "a joyful lullaby prompt",
  content: "generated lyrics content",
  version: 1,
  parentMessage: "A gentle song about bedtime.",
  musicMood: "Warm, joyful and playful.",
  musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
  voice: "FEMALE",
};

describe("Lyrics.create", () => {
  it("creates an unapproved lyrics version", () => {
    const lyrics = Lyrics.create(validInput);

    expect(lyrics.approved).toBe(false);
    expect(lyrics.rejectionReason).toBeNull();
    expect(lyrics.version).toBe(1);
    expect(lyrics.content).toBe("generated lyrics content");
    expect(lyrics.id).toBeTruthy();
  });

  it("rejects a missing prompt", () => {
    expect(() => Lyrics.create({ ...validInput, prompt: "  " })).toThrow();
  });

  it("rejects a missing content", () => {
    expect(() => Lyrics.create({ ...validInput, content: "" })).toThrow();
  });

  it("rejects a missing musicMood (Sprint v1.1 — AI Musical Direction)", () => {
    expect(() => Lyrics.create({ ...validInput, musicMood: "" })).toThrow();
  });

  it("rejects a missing musicDirection (Sprint v1.1 — AI Musical Direction)", () => {
    expect(() => Lyrics.create({ ...validInput, musicDirection: "" })).toThrow();
  });

  it.each([0, -1, 1.5])("rejects an invalid version %s", (version) => {
    expect(() => Lyrics.create({ ...validInput, version })).toThrow();
  });
});

describe("Lyrics.approve", () => {
  it("approves an unapproved, unrejected version", () => {
    const lyrics = Lyrics.create(validInput);
    lyrics.approve();
    expect(lyrics.approved).toBe(true);
  });

  it("cannot be approved twice", () => {
    const lyrics = Lyrics.create(validInput);
    lyrics.approve();
    expect(() => lyrics.approve()).toThrow();
  });

  it("cannot approve a rejected version", () => {
    const lyrics = Lyrics.create(validInput);
    lyrics.reject("moderation failed");
    expect(() => lyrics.approve()).toThrow();
  });
});

describe("Lyrics.reject", () => {
  it("sets a rejection reason", () => {
    const lyrics = Lyrics.create(validInput);
    lyrics.reject("moderation failed");
    expect(lyrics.rejectionReason).toBe("moderation failed");
    expect(lyrics.approved).toBe(false);
  });

  it("cannot reject an approved version", () => {
    const lyrics = Lyrics.create(validInput);
    lyrics.approve();
    expect(() => lyrics.reject("too late")).toThrow();
  });

  it("requires a non-empty reason", () => {
    const lyrics = Lyrics.create(validInput);
    expect(() => lyrics.reject("  ")).toThrow();
  });
});

describe("Lyrics.fromPersistence / toSnapshot", () => {
  it("round-trips through a snapshot", () => {
    const lyrics = Lyrics.create(validInput);
    const rehydrated = Lyrics.fromPersistence({
      id: lyrics.id,
      leadId: lyrics.leadId,
      moodId: lyrics.moodId,
      prompt: lyrics.prompt,
      content: lyrics.content,
      parentMessage: lyrics.parentMessage,
      musicMood: lyrics.musicMood,
      musicDirection: lyrics.musicDirection,
      voice: lyrics.voice,
      approved: lyrics.approved,
      rejectionReason: lyrics.rejectionReason,
      version: lyrics.version,
      createdAt: lyrics.createdAt,
    });

    expect(rehydrated.toSnapshot()).toEqual(lyrics.toSnapshot());
  });
});
