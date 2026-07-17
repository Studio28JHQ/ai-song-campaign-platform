import type { AdminLyricsRow } from "../contracts/AdminLyricsListGate";

/** Input to `ListLyricsUseCase` — pagination and free-text search for the "Letras" screen. */
export interface ListLyricsRequest {
  page: number;
  pageSize?: number;
  query?: string;
}

export interface ListLyricsResponse {
  items: AdminLyricsRow[];
  total: number;
  page: number;
  pageSize: number;
}
