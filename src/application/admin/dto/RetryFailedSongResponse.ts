import type { SongSnapshot } from "@/domain/song/types";

/** Output of `RetryFailedSongUseCase`. */
export interface RetryFailedSongResponse {
  song: SongSnapshot;
}
