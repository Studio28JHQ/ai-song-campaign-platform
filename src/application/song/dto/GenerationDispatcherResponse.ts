import type { SongSnapshot } from "@/domain/song/types";

/**
 * Output of `GenerationDispatcher`. Not sent to any client directly —
 * this runs in the background — but returned for testability. `null`
 * means the dispatcher had nothing to do this run: either a generation
 * was already in flight, or the queue was empty.
 */
export interface GenerationDispatcherResponse {
  song: SongSnapshot;
}
