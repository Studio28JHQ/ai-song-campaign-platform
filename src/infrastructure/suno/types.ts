/** The request payload sent to Suno's generation endpoint. */
export interface SunoRequestPayload {
  prompt: string;
  lyrics: string;
  tags: string;
  title: string;
}

/** The structured result this integration produces once Suno responds. */
export interface SunoApiResult {
  providerSongId: string;
  audioUrl: string;
  duration: number | null;
}
