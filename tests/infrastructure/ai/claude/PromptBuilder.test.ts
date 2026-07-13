import { describe, expect, it } from "vitest";
import { PromptBuilder, type PromptBuilderInput } from "@/infrastructure/ai/claude/PromptBuilder";

const input: PromptBuilderInput = {
  babyName: "Baby Doe",
  parentMessage: "A gentle song about bedtime.",
  mood: { name: "Joyful", description: "upbeat and cheerful" },
  language: "en",
};

describe("PromptBuilder.build", () => {
  it("includes the dynamic inputs in the user message", () => {
    const prompt = PromptBuilder.build(input);

    expect(prompt.user).toContain("Baby Doe");
    expect(prompt.user).toContain("A gentle song about bedtime.");
    expect(prompt.user).toContain("Joyful");
    expect(prompt.user).toContain("en");
  });

  it("works without a mood description", () => {
    const prompt = PromptBuilder.build({ ...input, mood: { name: "Calm" } });
    expect(prompt.user).toContain("Calm");
  });

  it("includes every campaign rule in the system prompt", () => {
    const prompt = PromptBuilder.build(input);

    expect(prompt.system).toMatch(/baby's name naturally/i);
    expect(prompt.system).toMatch(/family-friendly/i);
    expect(prompt.system).toMatch(/political/i);
    expect(prompt.system).toMatch(/religious/i);
    expect(prompt.system).toMatch(/offensive/i);
    expect(prompt.system).toMatch(/sexual/i);
    expect(prompt.system).toMatch(/discrimination/i);
    expect(prompt.system).toMatch(/copyrighted/i);
    expect(prompt.system).toMatch(/brands/i);
    expect(prompt.system).toMatch(/medical or health/i);
    expect(prompt.system).toMatch(/children's song/i);
  });

  it("includes safety (moderation) instructions", () => {
    const prompt = PromptBuilder.build(input);
    expect(prompt.system).toMatch(/moderate the parent's message/i);
    expect(prompt.system).toMatch(/non-judgmental/i);
  });

  it("includes the required writing structure", () => {
    const prompt = PromptBuilder.build(input);
    expect(prompt.system).toContain("Title");
    expect(prompt.system).toContain("Verse 1");
    expect(prompt.system).toContain("Chorus");
    expect(prompt.system).toContain("Verse 2");
    expect(prompt.system).toContain("Final Chorus");
    expect(prompt.system).toMatch(/2-3 minutes/);
    expect(prompt.system).toMatch(/plain text only/i);
  });

  it("requests a single, structured JSON-only response", () => {
    const prompt = PromptBuilder.build(input);
    expect(prompt.system).toMatch(/single JSON object/i);
    expect(prompt.system).toContain('"approved": true, "reason": null, "lyrics"');
    expect(prompt.system).toContain('"approved": false, "reason"');
    expect(prompt.system).toMatch(/no free text/i);
  });
});
