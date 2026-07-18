export interface PromptBuilderInput {
  babyName: string;
  parentMessage: string;
  mood: { name: string; description?: string };
  language: string;
}

export interface ClaudePrompt {
  system: string;
  user: string;
}

// See docs/Architecture/External_Services.md ("Claude API") for the
// reasoning behind these fixed rule blocks.

const CAMPAIGN_RULES = `
The generated lyrics must:
- Use the baby's name naturally, woven into the song rather than just inserted.
- Remain family-friendly and suitable for all ages.
- Avoid political content of any kind.
- Avoid religious content of any kind.
- Avoid offensive, vulgar, or otherwise inappropriate language.
- Avoid sexual content of any kind.
- Avoid discrimination against any group or individual.
- Avoid copyrighted lyrics or melodies from existing songs.
- Avoid mentioning brands, products, or competitors.
- Avoid promising medical or health benefits of any kind.
- Be compatible in tone and content with a children's song.
`.trim();

const SAFETY_RULES = `
Before generating lyrics, moderate the parent's message against the campaign rules above.
Set "approved" to false if the parent's message requests, implies, or would require the lyrics to contain:
- Political, religious, sexual, offensive, or discriminatory content.
- Copyrighted material, brand mentions, or medical/health claims.
- Hate speech, harassment, or any content unsafe for a children's song.
Otherwise, set "approved" to true.
When rejecting, "reason" must be a short, neutral, non-judgmental explanation suitable for showing directly to the parent.
`.trim();

const WRITING_INSTRUCTIONS = `
When approved, write the lyrics with this structure, in this order:
Title
Verse 1
Chorus
Verse 2
Final Chorus

Keep the total length suitable for approximately 2-3 minutes of music.
Return the lyrics as plain text only — no markdown, no explanations, no section labels beyond the five listed above.
`.trim();

// Sprint UI-3C — UX Polish. The lyrics must always come back in Spanish,
// regardless of what language the parent's own message happens to be
// written in — this campaign's audience is entirely Spanish-speaking,
// and a mixed- or English-language song is a defect, not a valid
// creative choice.
const LANGUAGE_RULES = `
Write the lyrics entirely in Spanish, regardless of the language the parent's message is written in.
Do not mix languages within the lyrics — every word must be Spanish, except the baby's name and any other proper name, which must be kept exactly as given, never translated or altered.
Use a warm, tender, childlike tone suitable for a family audience.
Use neutral Latin American Spanish — avoid regional slang, "vosotros" forms, or wording tied to a single country.
`.trim();

// Sprint v1.1 — AI Musical Direction. Claude is now responsible for all
// creative direction, not just the lyrics: alongside the lyrics text,
// the same call also produces a short emotional profile (`musicMood`)
// and a short musical-arrangement direction (`musicDirection`), both
// inferred from the parent's message, the selected mood, and the
// lyrics just written — never a copy of the parent's own words, and
// never mentioning implementation details, AI, or any music generation
// provider by name. Mureka (see `mureka/PromptBuilder`) only composes
// the music from these — it never invents musical direction itself.
const MUSIC_DIRECTION_INSTRUCTIONS = `
When approved, also generate two short, creative music-direction fields — both inferred from the parent's message, the selected mood, and the lyrics you just wrote, never copied verbatim from the parent's own words:

"musicMood": a concise emotional profile (a few words), a creative interpretation of the song's feeling — not a restatement of the mood name. Example style: "Warm, joyful and playful." / "Calm, peaceful and intimate." / "Hopeful, emotional and uplifting."

"musicDirection": a concise musical direction (one short sentence) describing only the intended musical arrangement and instrumentation. Never mention implementation details, AI, or any music generation tool or provider by name. Example style: "Warm acoustic arrangement with gentle piano, ukulele, light percussion and an easy-to-sing melody." / "Soft lullaby with music box textures, delicate strings and intimate piano." / "Playful acoustic children's arrangement with bright rhythm and memorable chorus."

Write both fields in English, regardless of the lyrics' language. Both must be null when "approved" is false.
`.trim();

const RESPONSE_FORMAT_INSTRUCTIONS = `
Respond with a single JSON object and nothing else — no free text, no markdown code fences, no commentary before or after it.
The JSON object must match exactly one of these two shapes:

{"approved": true, "reason": null, "lyrics": "...generated lyrics...", "musicMood": "...", "musicDirection": "..."}
{"approved": false, "reason": "...moderation reason...", "lyrics": null, "musicMood": null, "musicDirection": null}
`.trim();

/**
 * Builds the single prompt sent to Claude — one request that both
 * moderates the parent's message and, if approved, generates the lyrics.
 * No campaign/safety/writing rule lives anywhere else; this is the one
 * place they're defined.
 */
export class PromptBuilder {
  static build(input: PromptBuilderInput): ClaudePrompt {
    const mood = input.mood.description
      ? `${input.mood.name} (${input.mood.description})`
      : input.mood.name;

    const system = [
      "You are a content moderation and songwriting assistant for a marketing campaign that generates personalized songs for babies.",
      "",
      "Campaign rules:",
      CAMPAIGN_RULES,
      "",
      "Safety rules:",
      SAFETY_RULES,
      "",
      "Writing instructions:",
      WRITING_INSTRUCTIONS,
      "",
      "Language rules:",
      LANGUAGE_RULES,
      "",
      "Music direction:",
      MUSIC_DIRECTION_INSTRUCTIONS,
      "",
      RESPONSE_FORMAT_INSTRUCTIONS,
    ].join("\n");

    const user = [
      `Baby name: ${input.babyName}`,
      `Selected mood: ${mood}`,
      `Language: ${input.language}`,
      `Parent message: ${input.parentMessage}`,
    ].join("\n");

    return { system, user };
  }
}
