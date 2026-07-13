import type { LyricsSnapshot } from "@/domain/lyrics/types";

/** Boundary-facing output of `ApproveLyricsUseCase`. Carries a plain `LyricsSnapshot`, never the `Lyrics` entity itself. */
export interface ApproveLyricsResponse {
  lyrics: LyricsSnapshot;
}
