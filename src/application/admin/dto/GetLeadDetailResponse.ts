import type { LeadSnapshot } from "@/domain/lead/types";
import type { LyricsSnapshot } from "@/domain/lyrics/types";
import type { SongSnapshot } from "@/domain/song/types";
import type { ExecutionHistoryItem } from "./ExecutionHistoryItem";

/**
 * The Song view exposed to the admin panel — everything from
 * `SongSnapshot` except the raw `audioStorageKey` (an internal R2
 * object key, never useful to a client on its own), replaced with a
 * freshly resolved `audioUrl` (Sprint 9.1 — see `AudioUrlResolver`;
 * `null` until the song is `COMPLETED`).
 */
export type LeadDetailSongView = Omit<SongSnapshot, "audioStorageKey"> & {
  audioUrl: string | null;
};

/** Output of `GetLeadDetailUseCase` — everything the read-only Lead Detail screen needs (see docs/Product/User_Flow.md). */
export interface GetLeadDetailResponse {
  lead: LeadSnapshot;
  lyricsHistory: LyricsSnapshot[];
  approvedLyrics: LyricsSnapshot | null;
  song: LeadDetailSongView | null;
  executionHistory: ExecutionHistoryItem[];
}
