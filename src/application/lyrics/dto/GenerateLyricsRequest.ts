import type { Voice } from "@/domain/lyrics/types";

/**
 * Boundary-facing input for `GenerateLyricsUseCase`. `content` is the
 * already-generated lyrics text — this use case manages lyrics versions,
 * it does not call Claude (or any provider) itself.
 */
export interface GenerateLyricsRequest {
  leadId: string;
  moodId: string;
  prompt: string;
  content: string;
  /** Sprint v1.1 — AI Musical Direction. See `CreateLyricsInput`. */
  parentMessage: string;
  musicMood: string;
  musicDirection: string;
  voice: Voice;
}
