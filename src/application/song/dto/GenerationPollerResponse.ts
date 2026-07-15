import type { SongSnapshot } from "@/domain/song/types";

/**
 * Output of `GenerationPoller`. Not sent to any client directly — this
 * runs in the background — but returned for testability. `null` means
 * no song is currently awaiting provider completion. `outcome`
 * distinguishes a still-in-flight poll from a terminal one: `ready` is
 * Mureka's async success path (download, upload to R2, `COMPLETED`,
 * email — Gate 9.5); `completed` is the same handling for a
 * hypothetical synchronous provider, which the port still structurally
 * supports even though none is currently wired in. Neither is a
 * persisted domain concept — both simply mean `Song.status ===
 * "COMPLETED"`; see `GenerationPoller`.
 */
export interface GenerationPollerResponse {
  song: SongSnapshot;
  outcome: "pending" | "completed" | "ready" | "failed";
}
