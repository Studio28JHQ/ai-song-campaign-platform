import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/infrastructure/lyria/PromptBuilder";
import { MUREKA_STYLE } from "@/infrastructure/mureka/PromptBuilder";

const APPROVED_LYRICS = `[Verse]
Liam abre los ojos y se pone a reír,
con mi mismo rostro empieza a descubrir.

[Chorus]
Liam, Liam, alma gemela y espejo fiel,
dos risas iguales, un mismo vaivén.

[Ending]
Juntos bailando, felices los dos,
con Sensyderm Baby cuidando su piel al sol.`;

const baseInput = {
  lyrics: APPROVED_LYRICS,
  musicMood: "Playful, warm and bouncy",
  musicDirection: "Upbeat acoustic children's arrangement with bright ukulele.",
  voice: "FEMALE" as const,
};

describe("Lyria PromptBuilder.build", () => {
  it("keeps every musical instruction Mureka's STYLE specifies", () => {
    const prompt = PromptBuilder.build(baseInput);

    // Same musical brief, stated independently of Mureka's wording: tempo,
    // instrumentation, vocal character and entry, shape, duration ceiling
    // and the ban on padding.
    expect(prompt).toContain("86 BPM");
    expect(prompt).toContain("acoustic folk-pop");
    expect(prompt).toMatch(/ukulele/);
    expect(prompt).toMatch(/marimba/);
    expect(prompt).toMatch(/glockenspiel/);
    expect(prompt).toContain("Latin Spanish");
    expect(prompt).toContain("60 seconds");
    expect(prompt).toContain("never padded");
    expect(prompt).toMatch(/exactly once/);
  });

  it("does not send Mureka's STYLE, whose commercial framing Google's safety filter rejects", () => {
    const prompt = PromptBuilder.build(baseInput);

    // Verified against the live API: `MUREKA_STYLE` alone is accepted and the
    // approved lyrics alone are accepted, but the two together are refused
    // with HTTP 400 "Input blocked … sensitive words" — the commercial
    // framing next to a lyric naming a small child reads as advertising
    // directed at a minor. See `LYRIA_STYLE`'s doc comment.
    expect(prompt).not.toContain(MUREKA_STYLE);
    expect(prompt.toLowerCase()).not.toContain("commercial social media");
    expect(prompt.toLowerCase()).not.toContain("baby-care");
    expect(prompt.toLowerCase()).not.toContain("addressed to the baby");
  });

  it("passes the approved lyrics through byte for byte", () => {
    const prompt = PromptBuilder.build(baseInput);

    expect(prompt).toContain(APPROVED_LYRICS);
    // Section tags, punctuation, the baby's name and the brand mention all
    // survive exactly as approved — including `[Ending]`, which Google does
    // not document as a section tag and which is deliberately not remapped.
    expect(prompt).toContain("[Ending]");
    expect(prompt).toContain("Sensyderm Baby");
    expect(prompt).toContain("Liam, Liam, alma gemela y espejo fiel,");
  });

  it.each([
    ["FEMALE" as const, "warm female lead vocal"],
    ["MALE" as const, "warm male lead vocal"],
  ])("describes the %s voice in the prompt, since Lyria has no gender field", (voice, expected) => {
    const prompt = PromptBuilder.build({ ...baseInput, voice });

    expect(prompt).toContain(expected);
  });

  it("does not leak the parent's own message — it never reaches this layer", () => {
    const prompt = PromptBuilder.build(baseInput);

    // `SongGenerationInput` has no `parentMessage` field at all; this guards
    // the invariant from the provider side too.
    expect(prompt).not.toContain("réplica");
  });
});
