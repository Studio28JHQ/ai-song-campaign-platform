/**
 * What `GenerateLyricsForLeadUseCase` needs from an AI moderation +
 * generation provider — nothing more. Keeps the use case decoupled from
 * `@/infrastructure/ai/claude` (a concrete provider) so it can be
 * constructed with a fake in tests and swapped later without changing
 * this file. Satisfied as-is by `ClaudeLyricsService`, which happens to
 * share this exact shape.
 */
export interface LyricsGeneratorInput {
  babyName: string;
  parentMessage: string;
  mood: { name: string; description?: string };
  language: string;
}

export interface LyricsGeneratorResult {
  approved: boolean;
  reason: string | null;
  lyrics: string | null;
  /**
   * Sprint v1.1 — AI Musical Direction. Claude's own creative
   * interpretation of the song's mood and intended musical arrangement,
   * generated in the same call as `lyrics` — `null` whenever `lyrics`
   * is (i.e. on a moderation rejection).
   */
  musicMood: string | null;
  musicDirection: string | null;
}

export interface LyricsGenerator {
  generateAndModerate(input: LyricsGeneratorInput): Promise<LyricsGeneratorResult>;
}
