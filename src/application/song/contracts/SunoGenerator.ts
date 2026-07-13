/**
 * What `GenerateSongUseCase` needs from a song generation provider —
 * nothing more. Keeps the use case decoupled from
 * `@/infrastructure/suno` (a concrete provider) so it can be constructed
 * with a fake in tests and swapped later without changing this file.
 * Satisfied as-is by `SunoSongService`, which happens to share this exact
 * shape.
 */
export interface SunoGenerationInput {
  lyrics: string;
  moodName: string;
  sunoPrompt: string;
}

export interface SunoGenerationResult {
  providerSongId: string;
  audioUrl: string;
  duration: number | null;
}

export interface SunoGenerator {
  generateSong(input: SunoGenerationInput): Promise<SunoGenerationResult>;
}
