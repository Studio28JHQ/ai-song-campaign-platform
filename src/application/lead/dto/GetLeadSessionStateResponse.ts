import type { SongStatus } from "@/domain/song/types";

export interface ApprovedLyricsSummary {
  id: string;
  content: string;
  version: number;
}

export interface CurrentSongSummary {
  id: string;
  status: SongStatus;
  audioUrl: string | null;
  duration: number | null;
}

export interface GetLeadSessionStateResponse {
  babyName: string;
  remainingAttempts: number;
  leadStatus: string;
  approvedLyrics: ApprovedLyricsSummary | null;
  song: CurrentSongSummary | null;
}
