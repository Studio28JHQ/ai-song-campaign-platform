import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/infrastructure/mureka/PromptBuilder";

describe("PromptBuilder.build", () => {
  it("maps the shared SongGenerationInput into Mureka's request shape", () => {
    const payload = PromptBuilder.build({
      lyrics: "Title\nVerse 1",
      moodName: "Joyful",
      sunoPrompt: "upbeat joyful lullaby",
    });

    expect(payload).toEqual({
      lyrics: "Title\nVerse 1",
      model: "auto",
      prompt: "upbeat joyful lullaby",
      n: 1,
    });
  });

  it("passes the lyrics text through verbatim, never regenerating or editing it", () => {
    const lyrics = "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus";
    const payload = PromptBuilder.build({ lyrics, moodName: "Calm", sunoPrompt: "soft lullaby" });

    expect(payload.lyrics).toBe(lyrics);
  });

  it("always requests exactly one song", () => {
    const payload = PromptBuilder.build({
      lyrics: "Title\n...",
      moodName: "Playful",
      sunoPrompt: "fun and bouncy",
    });

    expect(payload.n).toBe(1);
  });
});
