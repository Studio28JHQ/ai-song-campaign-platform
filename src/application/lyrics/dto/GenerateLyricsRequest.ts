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
}
