import type { SongSnapshot } from "@/domain/song/types";

/**
 * Output of `GenerationPoller`. Not sent to any client directly — this
 * runs in the background — but returned for testability. `null` means
 * no song is currently awaiting provider completion. `outcome`
 * distinguishes a still-in-flight poll from a terminal one.
 */
export interface GenerationPollerResponse {
  song: SongSnapshot;
  outcome: "pending" | "completed" | "ready_to_download" | "failed";
}
