import type { SongSnapshot } from "@/domain/song/types";

/** Boundary-facing output of `GenerateSongUseCase`. Carries a plain `SongSnapshot`, never the `Song` entity itself. */
export interface GenerateSongResponse {
  song: SongSnapshot;
}
