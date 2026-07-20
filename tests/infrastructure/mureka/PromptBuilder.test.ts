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
        "Voice:",
        "Female voice",
      ].join("\n"),
    );
  });

  it("passes the lyrics text through verbatim as the top-level field, never regenerated or edited", () => {
    const lyrics = "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus";
    const payload = PromptBuilder.build({ ...baseInput, lyrics });

    expect(payload.lyrics).toBe(lyrics);
  });

  it("never duplicates the lyrics text inside prompt — Mureka's real API rejects a prompt over 1024 characters, and lyrics already has its own dedicated field", () => {
    const lyrics = "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus";
    const payload = PromptBuilder.build({ ...baseInput, lyrics });

    expect(payload.prompt).not.toContain(lyrics);
    expect(payload.prompt).not.toContain("Lyrics:");
  });

  it("keeps prompt comfortably short regardless of song length, since it never embeds the lyrics", () => {
    // A full, multi-section song's worth of lyrics — long enough that
    // embedding it in `prompt` (the actual production defect) would
    // have exceeded Mureka's 1024-character limit.
    const longLyrics = Array.from(
      { length: 12 },
      (_, i) => `[Section ${i}]\n` + "La la la, a line of lyrics for this section.\n".repeat(3),
    ).join("\n");

    const payload = PromptBuilder.build({ ...baseInput, lyrics: longLyrics });

    expect(payload.lyrics).toBe(longLyrics);
    expect(payload.prompt.length).toBeLessThan(1024);
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

    it("the prompt contains exactly the three creative-direction sections, in order, and nothing else", () => {
      const payload = PromptBuilder.build(baseInput);
      const moodIndex = payload.prompt.indexOf("Mood:");
      const directionIndex = payload.prompt.indexOf("Musical Direction:");
      const voiceIndex = payload.prompt.indexOf("Voice:");

      expect(payload.prompt.startsWith("Create an original children's song.")).toBe(true);
      expect(moodIndex).toBeGreaterThan(0);
      expect(directionIndex).toBeGreaterThan(moodIndex);
      expect(voiceIndex).toBeGreaterThan(directionIndex);
      expect(payload.prompt).not.toContain("Lyrics:");
    });
  });

  describe("Sprint v1.3 (AI Songwriting Quality): structured lyrics preservation", () => {
    it("passes every official section label through to Mureka unchanged, in the top-level lyrics field", () => {
      const structuredLyrics = [
        "[Intro]",
        "La la la",
        "",
        "[Verse 1]",
        "Sofía llegó con luz de sol",
        "",
        "[Pre-Chorus]",
        "Y el corazón se llena de emoción",
        "",
        "[Chorus]",
        "Sofía, Sofía, mi pequeño sol",
        "",
        "[Verse 2]",
        "Cada risa tuya es un tesoro",
        "",
        "[Pre-Chorus]",
        "Y el corazón se llena de emoción",
        "",
        "[Chorus]",
        "Sofía, Sofía, mi pequeño sol",
        "",
        "[Bridge]",
        "Siempre estaré junto a ti",
        "",
        "[Final Chorus]",
        "Sofía, Sofía, mi pequeño sol",
        "",
        "[Outro]",
        "Duerme bien, mi amor",
      ].join("\n");

      const payload = PromptBuilder.build({ ...baseInput, lyrics: structuredLyrics });

      expect(payload.lyrics).toBe(structuredLyrics);
      // Not duplicated into prompt — see the 1024-character-limit tests above.
      expect(payload.prompt).not.toContain(structuredLyrics);

      for (const label of [
        "[Intro]",
        "[Verse 1]",
        "[Pre-Chorus]",
        "[Chorus]",
        "[Verse 2]",
        "[Bridge]",
        "[Final Chorus]",
        "[Outro]",
      ]) {
        expect(payload.lyrics).toContain(label);
      }
    });

    it("does not change the current Mureka prompt shape — still exactly Mood/Musical Direction/Voice", () => {
      const payload = PromptBuilder.build(baseInput);
      expect(payload.prompt).toBe(
        [
          "Create an original children's song.",
          "",
          "Mood:",
          baseInput.musicMood,
          "",
          "Musical Direction:",
          baseInput.musicDirection,
          "",
          "Voice:",
          "Female voice",
        ].join("\n"),
      );
    });
  });
});
