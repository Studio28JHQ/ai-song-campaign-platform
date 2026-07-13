import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/infrastructure/suno/PromptBuilder";

describe("PromptBuilder.build", () => {
  it("passes the lyrics through unchanged", () => {
    const lyrics = "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus";
    const payload = PromptBuilder.build({
      lyrics,
      moodName: "Joyful",
      sunoPrompt: "upbeat joyful lullaby",
    });

    expect(payload.lyrics).toBe(lyrics);
  });

  it("uses the mood's fixed Suno prompt as the generation prompt", () => {
    const payload = PromptBuilder.build({
      lyrics: "Title\n...",
      moodName: "Calm",
      sunoPrompt: "soft calming lullaby",
    });

    expect(payload.prompt).toBe("soft calming lullaby");
  });

  it("carries the mood name as a tag", () => {
    const payload = PromptBuilder.build({
      lyrics: "Title\n...",
      moodName: "Playful",
      sunoPrompt: "...",
    });
    expect(payload.tags).toBe("Playful");
  });

  it("extracts the title from the first line of the lyrics", () => {
    const payload = PromptBuilder.build({
      lyrics: "A Song For Baby\nVerse 1\n...",
      moodName: "Calm",
      sunoPrompt: "...",
    });

    expect(payload.title).toBe("A Song For Baby");
  });

  it("falls back to a generic title when the lyrics have no usable first line", () => {
    const payload = PromptBuilder.build({ lyrics: "", moodName: "Calm", sunoPrompt: "..." });
    expect(payload.title).toBe("Untitled");
  });
});
