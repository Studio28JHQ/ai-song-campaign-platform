import type { LyricsSnapshot } from "@/domain/lyrics/types";

/** Boundary-facing output of `GenerateLyricsUseCase`. Carries a plain `LyricsSnapshot`, never the `Lyrics` entity itself. */
export interface GenerateLyricsResponse {
  lyrics: LyricsSnapshot;
}
