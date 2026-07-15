/**
 * What `GenerationPoller` needs to deliver the "song ready" email —
 * nothing more. Keeps the worker decoupled from `@/infrastructure/email`
 * (a concrete Resend-backed adapter) so it can be constructed with a
 * fake in tests, same pattern as `SongGenerationProvider`.
 */
export interface SongReadyEmailInput {
  to: string;
  parentName: string;
  babyName: string;
  songId: string;
  audioUrl: string;
  duration: number | null;
}

export interface SongEmailSender {
  sendSongReadyEmail(input: SongReadyEmailInput): Promise<void>;
}
