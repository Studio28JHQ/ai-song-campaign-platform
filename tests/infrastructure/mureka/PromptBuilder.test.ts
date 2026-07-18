import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/infrastructure/mureka/PromptBuilder";

const baseInput = {
  lyrics: "Title\nVerse 1",
  musicMood: "Warm, joyful and playful.",
  musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
  parentMessage: "A gentle song about bedtime.",
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
        "Baby Context:",
        "A gentle song about bedtime.",
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
});
