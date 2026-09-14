import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/infrastructure/mureka/PromptBuilder";

const baseInput = {
  lyrics: "Title\nVerse 1",
  musicMood: "Warm, joyful and playful.",
  musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
  voice: "FEMALE" as const,
};

const VALIDATED_STYLE_SNIPPET = "acoustic folk-pop";

describe("PromptBuilder.build", () => {
  it("sends the fixed, validated STYLE as the prompt, plus the official contract's other fields", () => {
    const payload = PromptBuilder.build(baseInput);

    expect(payload.model).toBe("auto");
    expect(payload.n).toBe(1);
    expect(payload.stream).toBe(false);
    expect(payload.prompt).toContain(VALIDATED_STYLE_SNIPPET);
    expect(payload.prompt).toContain("86 BPM");
  });

  it("no longer names a brand phrase to pronounce — brand placement is governed by the lyrics themselves", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.prompt).not.toContain("Bassa Sensi-Derm Baby");
    expect(payload.prompt).not.toContain("Sensyderm");
    expect(payload.prompt).not.toContain("clearly pronounce");
  });

  it("names 'Pequeñas grandes historias' only as an emotional concept, not as mandatory sung text", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.prompt).toContain('"Pequeñas grandes historias" as an emotional concept only');
  });

  it("treats 60 seconds as a maximum, not a target, and prefers a shorter complete performance over padding", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.prompt).toMatch(/up to about 60 seconds, shorter is fine, never padded/i);
    expect(payload.prompt).not.toMatch(/approximately 60 seconds/i);
  });

  it("forbids instrumental padding and filler vocalizations (humming, mmm, uh, ooh)", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.prompt).toMatch(/no instrumental padding/i);
    expect(payload.prompt).toMatch(/no filler vocalizations \(humming, mmm, uh, ooh\)/i);
    expect(payload.prompt).toMatch(/no long instrumental intro/i);
  });

  it("instructs singing the provided lyrics continuously and naturally, using the vocal time for the story", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.prompt).toMatch(
      /sing the lyrics exactly once, continuously and naturally, using the vocal time for the story/i,
    );
  });

  it("describes the two-verse jingle shape, matching the Claude two-[Verse] structure", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.prompt).toMatch(
      /two compact narrative verses, one memorable chorus, a genuine emotional ending/i,
    );
  });

  it("gives vocal-entry timing around second 5, not a deterministic guarantee, allowing only a brief pickup", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.prompt).toMatch(/lead vocals enter by about second 5/i);
    expect(payload.prompt).toMatch(/only a brief musical pickup/i);
    expect(payload.prompt).toMatch(/no long instrumental intro/i);
    // The earlier, apparently-ineffective "within the first two seconds" wording must be gone.
    expect(payload.prompt).not.toMatch(/within the first two seconds/i);
  });

  it("uses the exact same fixed STYLE regardless of the Lyrics version's own musicMood/musicDirection", () => {
    // musicMood/musicDirection are still Claude-generated and still
    // persisted (the admin panel displays them), but no longer flow
    // into Mureka's request — the prompt is fixed and validated,
    // identical for every submission.
    const payloadA = PromptBuilder.build({
      ...baseInput,
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
    });
    const payloadB = PromptBuilder.build({
      ...baseInput,
      musicMood: "Completely different mood.",
      musicDirection: "A totally different musical direction.",
    });

    expect(payloadA.prompt).toBe(payloadB.prompt);
    expect(payloadA.prompt).not.toContain("Warm acoustic arrangement");
    expect(payloadA.prompt).not.toContain("Completely different mood.");
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

  it("maps FEMALE to Mureka's dedicated gender field", () => {
    const payload = PromptBuilder.build({ ...baseInput, voice: "FEMALE" });
    expect(payload.gender).toBe("female");
  });

  it("maps MALE to Mureka's dedicated gender field", () => {
    const payload = PromptBuilder.build({ ...baseInput, voice: "MALE" });
    expect(payload.gender).toBe("male");
  });

  /**
   * The STYLE text no longer hardcodes "male" — `gender` (dynamic, from
   * the lead's own Voice selection) is the only place a narrator's
   * gender is expressed in the Mureka request, for either voice.
   */
  it("never describes an unconditional voice gender in the STYLE text — gender lives only in the dedicated field", () => {
    const female = PromptBuilder.build({ ...baseInput, voice: "FEMALE" });
    const male = PromptBuilder.build({ ...baseInput, voice: "MALE" });

    expect(female.gender).toBe("female");
    expect(male.gender).toBe("male");
    expect(female.prompt).toBe(male.prompt); // the STYLE text itself never varies by voice
    expect(female.prompt).not.toContain("male");
    expect(female.prompt).not.toContain("female");
    expect(female.prompt).toContain("warm Latin Spanish voice");
  });

  it("always requests exactly one song", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.n).toBe(1);
  });

  it("never streams — this pipeline always polls to completion", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.stream).toBe(false);
  });

  it("never reads Mood.sunoPrompt — the prompt is the fixed, validated STYLE, not any per-mood value", () => {
    const payload = PromptBuilder.build(baseInput);
    expect(payload.prompt).not.toContain("sunoPrompt");
  });

  describe("AI Safety Hardening: Mureka isolation from the parent message", () => {
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

    it("the prompt is the fixed STYLE text only — no Lyrics:/Voice: section of any kind", () => {
      const payload = PromptBuilder.build(baseInput);
      expect(payload.prompt).not.toContain("Lyrics:");
      expect(payload.prompt).not.toContain("Voice:");
    });
  });

  describe("official Mureka request contract", () => {
    it("sends exactly the documented fields — no reference_id, vocal_id, or melody_id", () => {
      const payload = PromptBuilder.build(baseInput);

      expect(Object.keys(payload).sort()).toEqual(
        ["gender", "lyrics", "model", "n", "prompt", "stream"].sort(),
      );
    });
  });

  describe("structured lyrics preservation", () => {
    it("passes every official section label through to Mureka unchanged, in the top-level lyrics field", () => {
      const structuredLyrics = [
        "[Verse]",
        "Sofía llegó con luz de sol",
        "",
        "[Verse]",
        "Cada risa tuya es un tesoro",
        "",
        "[Chorus]",
        "Sofía, Sofía, mi pequeño sol",
        "",
        "[Ending]",
        "Sensyderm Baby",
      ].join("\n");

      const payload = PromptBuilder.build({ ...baseInput, lyrics: structuredLyrics });

      expect(payload.lyrics).toBe(structuredLyrics);
      // Not duplicated into prompt — see the 1024-character-limit tests above.
      expect(payload.prompt).not.toContain(structuredLyrics);

      for (const label of ["[Verse]", "[Chorus]", "[Ending]"]) {
        expect(payload.lyrics).toContain(label);
      }
    });

    it("structured lyrics have no effect on the (fixed) prompt text", () => {
      const structuredLyrics = "[Verse]\nLa la la\n\n[Chorus]\nSofía, mi sol";
      const payload = PromptBuilder.build({ ...baseInput, lyrics: structuredLyrics });
      expect(payload.prompt).toContain(VALIDATED_STYLE_SNIPPET);
    });
  });
});
