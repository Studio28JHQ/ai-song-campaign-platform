/**
 * What `SongGenerationWorker` needs from a music generation provider —
 * nothing more. Keeps the worker decoupled from any concrete provider
 * (Suno today, Mureka in a future sprint — see PROJECT_MANIFEST.md), so
 * it can be constructed with a fake in tests and swapped later without
 * changing this file or the worker itself. No provider-specific name,
 * type, or logic belongs in this file — that lives entirely in
 * `src/infrastructure/` (e.g. `SunoSongService`).
 */
export interface SongGenerationInput {
  lyrics: string;
  moodName: string;
  sunoPrompt: string;
}

export interface SongGenerationResult {
  providerSongId: string;
  audioUrl: string;
  duration: number | null;
}

export interface SongGenerationProvider {
  generateSong(input: SongGenerationInput): Promise<SongGenerationResult>;
}
