import type { SongShareLinks } from "../services/songShareUrl";

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
  /**
   * The song's public page plus the tracking URLs its share buttons point
   * at, or `null` when it has no public page. Built by the caller
   * (`buildSongShareLinks`) so the template never handles a token — see
   * `SongReadyEmailTemplate`.
   */
  shareLinks: SongShareLinks | null;
}

export interface SongEmailSender {
  sendSongReadyEmail(input: SongReadyEmailInput): Promise<void>;
}
