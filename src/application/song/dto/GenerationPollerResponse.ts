import type { SongSnapshot } from "@/domain/song/types";

/**
 * Output of `GenerationPoller`. Not sent to any client directly — this
 * runs in the background — but returned for testability. `null` means
 * no song is currently awaiting provider completion. `outcome`
 * distinguishes a still-in-flight poll from a terminal one: `completed`
 * is Suno's synchronous success path (download, upload, `COMPLETED`,
 * email); `ready` (Gate 9.4) is an async provider's success path —
 * identical download/upload/`COMPLETED` handling, but no email attempt
 * this run. Neither is a persisted domain concept — both simply mean
 * `Song.status === "COMPLETED"`; see `GenerationPoller`.
 */
export interface GenerationPollerResponse {
  song: SongSnapshot;
  outcome: "pending" | "completed" | "ready" | "failed";
}
