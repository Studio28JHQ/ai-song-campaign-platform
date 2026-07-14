import type { SongSnapshot } from "@/domain/song/types";

/**
 * Output of `SongGenerationWorker`. Not sent to any client directly —
 * this runs in the background — but returned for testability. `null`
 * means the worker had nothing to do this run: either another
 * generation was already in flight (the provider allows only one
 * concurrent generation), or the queue was empty.
 */
export interface SongGenerationWorkerResponse {
  song: SongSnapshot;
}
