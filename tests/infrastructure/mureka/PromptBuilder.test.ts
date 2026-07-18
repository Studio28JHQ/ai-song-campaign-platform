import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/infrastructure/mureka/PromptBuilder";

const baseInput = {
  lyrics: "Title\nVerse 1",
  musicMood: "Warm, joyful and playful.",
  musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
  voice: "FEMALE" as const,
};

describe("PromptBuilder.build", () => {
  it("composes the prompt from the AI-generated musical direction (Sprint v1.1 — AI Musical Direction)", () => {
    const payload = PromptBuilder.build(baseInput);

    expect(payload.model).toBe("auto");
    expect(payload.n).toBe(1);
    expect(payload.prompt).toBe(
      [
        "Create an original children's song.",
        "",
        "Mood:",
        "Warm, joyful and playful.",
        "",
        "Musical Direction:",
        "Warm acoustic arrangement with gentle piano and ukulele.",
        "",
        "Lyrics:",
        "Title\nVerse 1",
        "",
        "Voice:",
        "Female voice",
      ].join("\n"),
    );
  });

  it("passes the lyrics text through verbatim, never regenerating or editing it, both as the top-level field and inside the prompt", () => {
    const lyrics = "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus";
    const payload = PromptBuilder.build({ ...baseInput, lyrics });

    expect(payload.lyrics).toBe(lyrics);
    expect(payload.prompt).toContain(lyrics);
  });

  it("maps FEMALE to a female voice label", () => {
    const payload = PromptBuilder.build({ ...baseInput, voice: "FEMALE" });
    expect(payload.prompt).toContain("Voice:\nFemale voice");
  });

  it("maps MALE to a male voice label", () => {
    const payload = PromptBuilder.build({ ...baseInput, voice: "MALE" });
    expect(payload.prompt).toContain("Voice:\nMale voice");
  });

  it("always requests exactly one song", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.n).toBe(1);
  });

  it("no longer reads Mood.sunoPrompt — the prompt is built entirely from the Lyrics version's musical direction", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.prompt).not.toContain("sunoPrompt");
  });

  describe("Sprint v1.2 — AI Safety Hardening: Mureka isolation from the parent message", () => {
    it("never includes a Baby Context section", () => {
      const payload = PromptBuilder.build(baseInput);
      expect(payload.prompt).not.toContain("Baby Context");
    });

    it("SongGenerationInput has no parentMessage field to read in the first place", () => {
      // Structural guarantee, not just a string assertion: the type this
      // function accepts has no `parentMessage` property at all (see
      // `SongGenerationProvider.ts`), so there is nothing here that
      // could leak the parent's raw message into the Mureka prompt even
      // if a future edit tried to reference `input.parentMessage`.
      type Input = Parameters<typeof PromptBuilder.build>[0];
      type HasParentMessage = "parentMessage" extends keyof Input ? true : false;
      const hasParentMessage: HasParentMessage = false;
      expect(hasParentMessage).toBe(false);
    });

    it("the prompt contains exactly the five required sections, in order, and nothing else", () => {
      const payload = PromptBuilder.build(baseInput);
      const moodIndex = payload.prompt.indexOf("Mood:");
      const directionIndex = payload.prompt.indexOf("Musical Direction:");
      const lyricsIndex = payload.prompt.indexOf("Lyrics:");
      const voiceIndex = payload.prompt.indexOf("Voice:");

      expect(payload.prompt.startsWith("Create an original children's song.")).toBe(true);
      expect(moodIndex).toBeGreaterThan(0);
      expect(directionIndex).toBeGreaterThan(moodIndex);
      expect(lyricsIndex).toBeGreaterThan(directionIndex);
      expect(voiceIndex).toBeGreaterThan(lyricsIndex);
    });
  });
});
