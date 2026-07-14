import type { SongSnapshot } from "@/domain/song/types";

/** Output of `ProcessSongGenerationUseCase`. Not sent to any client directly — this runs in the background — but returned for testability. */
export interface ProcessSongGenerationResponse {
  song: SongSnapshot;
}
