export interface DownloadedAudio {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * What `GenerationPoller` needs to fetch generated audio from a
 * provider's (short-lived) URL before re-hosting it in R2 — nothing
 * more. Implemented by `HttpAudioDownloader` (`src/infrastructure/`)
 * on top of the shared `httpRequest` helper, the same pattern as every
 * other outbound call in this codebase.
 */
export interface AudioDownloader {
  download(url: string): Promise<DownloadedAudio>;
}
