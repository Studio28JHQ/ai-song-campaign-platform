/** One row of the admin "Canciones" list, ready for display — signed URL resolved fresh, never the raw storage key (see `AudioUrlResolver`). */
export interface AdminSongView {
  id: string;
  leadId: string;
  createdAt: Date;
  parentName: string;
  babyName: string;
  status: string;
  provider: string;
  audioUrl: string | null;
  emailedAt: Date | null;
}

export interface ListSongsResponse {
  items: AdminSongView[];
}
