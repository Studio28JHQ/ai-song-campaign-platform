/**
 * What `GenerateSongUseCase` needs to know about a Mood — nothing more.
 * There is no Mood domain module yet (out of scope for this task), so
 * this is a narrow port rather than a full aggregate/repository,
 * satisfied by a thin Prisma-backed adapter in `src/infrastructure/`.
 */
export interface MoodDetails {
  name: string;
  sunoPrompt: string;
}

export interface MoodSunoPromptProvider {
  getMoodDetails(moodId: string): Promise<MoodDetails | null>;
}
