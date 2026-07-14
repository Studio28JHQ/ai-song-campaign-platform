import type { LeadSnapshot } from "@/domain/lead/types";
import type { LyricsSnapshot } from "@/domain/lyrics/types";
import type { SongSnapshot } from "@/domain/song/types";
import type { ExecutionHistoryItem } from "./ExecutionHistoryItem";

/** Output of `GetLeadDetailUseCase` — everything the read-only Lead Detail screen needs (see docs/Product/User_Flow.md). */
export interface GetLeadDetailResponse {
  lead: LeadSnapshot;
  lyricsHistory: LyricsSnapshot[];
  approvedLyrics: LyricsSnapshot | null;
  song: SongSnapshot | null;
  executionHistory: ExecutionHistoryItem[];
}
