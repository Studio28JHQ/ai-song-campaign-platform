import type { AdminSongStatusFilter } from "../contracts/AdminSongListGate";

/** Input to `ListSongsUseCase` — pagination, free-text search, and status filter for the "Canciones" screen. */
export interface ListSongsRequest {
  page: number;
  pageSize?: number;
  query?: string;
  status?: AdminSongStatusFilter;
}

/** One row of the admin "Canciones" list, ready for display — signed URL resolved fresh, never the raw storage key (see `AudioUrlResolver`). */
export interface AdminSongView {
  id: string;
  leadId: string;
  createdAt: Date;
  parentName: string;
  babyName: string;
  status: string;
  provider: string;
  musicDirection: string | null;
  audioUrl: string | null;
  providerError: string | null;
  emailedAt: Date | null;
}

export interface ListSongsResponse {
  items: AdminSongView[];
  total: number;
  page: number;
  pageSize: number;
}
