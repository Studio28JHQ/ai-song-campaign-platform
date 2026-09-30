import { describe, expect, it, vi } from "vitest";
import type { ClaudeClient } from "@/infrastructure/ai/claude/ClaudeClient";
import { ClaudeLyricsService } from "@/infrastructure/ai/claude/ClaudeLyricsService";
import {
  MODERATION_CATEGORY_RULES,
  PUBLIC_MODERATION_REASON,
} from "@/infrastructure/ai/claude/moderationCategories";
import { PromptBuilder } from "@/infrastructure/ai/claude/PromptBuilder";

/**
 * Moderation rewrite — the "dios bendiga a esta niña hermana" case.
 *
 * A parent's blessing for their own baby was rejected as
 * `RELIGIOUS_PROPAGANDA`, and the directed repair that followed rejected
 * it a second time. Three things in the prompt caused that, and these
 * tests hold all three closed:
 *
 * 1. The category text said "Religious propaganda **or religious
 *    content**" — broader than the safety bullet it names, which says
 *    propaganda. A category wider than its rule rejects what the rule
 *    allows.
 * 2. The campaign rule "Avoid religious content of any kind" is a
 *    constraint on the lyrics, but read as grounds to refuse a message
 *    that would "require" such content.
 * 3. The repair told Claude to "apply every safety rule again **to the
 *    message**" — a message handed over unchanged, so the instruction
 *    guaranteed the same verdict. The repair could only ever confirm the
 *    rejection it existed to fix.
 *
 * What is deliberately *not* tested here is a model's judgement: these
 * assert the instructions Claude receives, since the prompt is the only
 * part of this we control.
 */

const LEAD_ID = "11111111-1111-1111-1111-111111111111";

const REPORTED_CASE = {
  leadId: LEAD_ID,
  babyName: "Sofia",
  parentMessage: "dios bendiga a esta niña hermana",
  mood: { name: "Juguetón", description: "playful" },
  language: "es",
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          approved: true,
          reason: null,
          lyrics: "[Verse]\nSofia sonríe.",
          musicMood: "Warm, joyful and playful.",
          musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
          moderationCategory: null,
          ...overrides,
        }),
      },
    ],
  };
}

function rejection(category: string) {
  return payload({
    approved: false,
    reason: "El mensaje incluye contenido religioso.",
    moderationCategory: category,
    lyrics: null,
    musicMood: null,
    musicDirection: null,
  });
}

function clientReturning(...responses: unknown[]) {
  const sendMessage = vi.fn();
  for (const response of responses) sendMessage.mockResolvedValueOnce(response);
  sendMessage.mockResolvedValue(responses[responses.length - 1]);
  return { sendMessage, client: { sendMessage } as unknown as ClaudeClient };
}

describe("[A] the reported case: a parent's blessing", () => {
  it("tells Claude that a personal blessing is not propaganda and must not be rejected", () => {
    const prompt = PromptBuilder.build(REPORTED_CASE);

    expect(prompt.system).toMatch(
      /a parent blessing their own baby, thanking god for them, or writing "dios bendiga a esta niña" is expressing personal affection, not campaigning for a faith, and is never a reason to reject/i,
    );
  });

  it("asks for the affection to be carried into the song instead of refusing it", () => {
    const prompt = PromptBuilder.build(REPORTED_CASE);

    // The campaign still keeps religious wording out of the lyrics —
    // what changed is that this is a writing constraint, not a veto.
    expect(prompt.system).toMatch(/keep religious references out of the lyrics themselves/i);
    expect(prompt.system).toMatch(
      /this is a constraint on what we write, never a reason to refuse a message/i,
    );
    expect(prompt.system).toMatch(/express that same affection as warmth, hope and good wishes/i);
  });

  it("no longer instructs Claude to avoid religious content 'of any kind'", () => {
    // The exact wording that made a blessing read as forbidden content.
    const prompt = PromptBuilder.build(REPORTED_CASE);

    expect(prompt.system).not.toMatch(/avoid religious content of any kind/i);
  });

  it("generates normally when the message is approved — no repair, one call", async () => {
    const { sendMessage, client } = clientReturning(payload());

    const result = await new ClaudeLyricsService(client).generateAndModerate(REPORTED_CASE);

    expect(result.approved).toBe(true);
    expect(result.lyrics).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("reaches the generator through the repair when the first call still rejects", async () => {
    // The path the MD asks for: message → moderation → repair → lyrics,
    // never message → moderation → reject.
    const { sendMessage, client } = clientReturning(rejection("RELIGIOUS_PROPAGANDA"), payload());

    const result = await new ClaudeLyricsService(client).generateAndModerate(REPORTED_CASE);

    expect(result.approved).toBe(true);
    expect(result.lyrics).toBe("[Verse]\nSofia sonríe.");
    expect(result.reason).toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});

describe("[C][D] the repair produces and delivers a usable result", () => {
  it("carries the parent's intent, the baby and the mood into the repair call", async () => {
    const { sendMessage, client } = clientReturning(rejection("RELIGIOUS_PROPAGANDA"), payload());

    await new ClaudeLyricsService(client).generateAndModerate(REPORTED_CASE);

    const repair = sendMessage.mock.calls[1][0] as { user: string; system: string };
    expect(repair.user).toContain("Sofia");
    expect(repair.user).toContain("Juguetón");
    expect(repair.user).toContain("dios bendiga a esta niña hermana");
    expect(repair.user).toMatch(/Keep the legitimate intent of the message/i);
    expect(repair.user).toMatch(/replace with something neutral and warm/i);
  });

  it("[C] no longer tells the repair to re-judge the unchanged message", async () => {
    const repair = PromptBuilder.buildModerationRepair(REPORTED_CASE, "RELIGIOUS_PROPAGANDA");

    expect(repair.user).toMatch(/Judge the song you would now write, not the message/i);
    expect(repair.user).toMatch(
      /re-judging it can only reproduce the same rejection — which is why this call exists/i,
    );
    expect(repair.user).not.toMatch(/apply every safety rule again to the message/i);
  });

  it("[D] hands the repair's lyrics to the caller, not the original rejection", async () => {
    const { client } = clientReturning(rejection("RELIGIOUS_PROPAGANDA"), payload());

    const result = await new ClaudeLyricsService(client).generateAndModerate(REPORTED_CASE);

    // What the caller receives is the repaired generation, and nothing
    // of the rejection survives into it.
    expect(result.approved).toBe(true);
    expect(result.reason).not.toBe(PUBLIC_MODERATION_REASON);
    expect(JSON.stringify(result)).not.toContain("RELIGIOUS_PROPAGANDA");
  });
});

describe("[B] content that must still be rejected, still is", () => {
  it("keeps the propaganda rule, and keeps rejecting when Claude rejects twice", async () => {
    const { sendMessage, client } = clientReturning(
      rejection("RELIGIOUS_PROPAGANDA"),
      rejection("RELIGIOUS_PROPAGANDA"),
    );

    const result = await new ClaudeLyricsService(client).generateAndModerate(REPORTED_CASE);

    expect(result.approved).toBe(false);
    expect(result.reason).toBe(PUBLIC_MODERATION_REASON);
    expect(result.lyrics).toBeNull();
    // One repair, never two.
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("still names proselytising, promoting and recruiting as propaganda", () => {
    const prompt = PromptBuilder.build(REPORTED_CASE);

    expect(prompt.system).toMatch(
      /religious propaganda — content that preaches, promotes, persuades toward, or recruits for a political movement or a faith/i,
    );
    expect(MODERATION_CATEGORY_RULES.RELIGIOUS_PROPAGANDA).toMatch(
      /preaches, promotes, persuades toward, or recruits for a faith/i,
    );
  });

  it("keeps every other safety rule untouched", () => {
    const prompt = PromptBuilder.build(REPORTED_CASE);

    for (const rule of [
      "Abuse, humiliation, insults, or dehumanization",
      "Hate speech, harassment, or discrimination",
      "Violence, self-harm, or suicide",
      "Illegal activity of any kind",
      "Extremist content of any kind",
      "Sexual or otherwise explicit content",
      "Copyrighted lyrics or melodies from existing songs",
      "Defamatory content about any real person",
      "Any other content unsafe or inappropriate for a children's song",
    ]) {
      expect(prompt.system).toContain(rule);
    }
    expect(prompt.system).toContain("=== IMMUTABLE AI SAFETY POLICY ===");
  });

  it("does not turn the category into an allow-list entry", () => {
    // The explicitly forbidden workaround: RELIGIOUS_PROPAGANDA -> ALLOWED.
    expect(MODERATION_CATEGORY_RULES).toHaveProperty("RELIGIOUS_PROPAGANDA");
    expect(MODERATION_CATEGORY_RULES.RELIGIOUS_PROPAGANDA).toMatch(/propaganda/i);
  });

  it("the category never claims more than the safety rule it names", () => {
    // The original defect, stated as an invariant: the category said "or
    // religious content" while the rule said propaganda.
    expect(MODERATION_CATEGORY_RULES.RELIGIOUS_PROPAGANDA).not.toMatch(/or religious content/i);
  });
});

describe("[E] a technical failure is never reported as a content rejection", () => {
  it("throws a provider error instead of returning a moderation rejection", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const client = { sendMessage } as unknown as ClaudeClient;

    await expect(
      new ClaudeLyricsService(client).generateAndModerate(REPORTED_CASE),
    ).rejects.toThrow();
  });

  it("throws a malformed-response error rather than calling it a rejection", async () => {
    const { client } = clientReturning({ content: [{ type: "text", text: "not json" }] });

    const result = await new ClaudeLyricsService(client)
      .generateAndModerate(REPORTED_CASE)
      .catch((error: unknown) => error);

    expect(result).toBeInstanceOf(Error);
    expect((result as { code?: string }).code).toBe("claude.invalid_json");
  });
});
