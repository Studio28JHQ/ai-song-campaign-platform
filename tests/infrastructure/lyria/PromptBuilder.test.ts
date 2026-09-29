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
  it("sends the same validated STYLE Mureka receives, not a Lyria-specific rewrite", () => {
    const prompt = PromptBuilder.build(baseInput);

    // Imported from the Mureka adapter rather than copied, so the two
    // providers cannot drift apart in the A/B comparison.
    expect(prompt).toContain(MUREKA_STYLE);
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
    ["FEMALE" as const, "female lead vocal"],
    ["MALE" as const, "male lead vocal"],
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
