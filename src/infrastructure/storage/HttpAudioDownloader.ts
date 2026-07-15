import type {
  AudioDownloader,
  DownloadedAudio,
} from "@/application/song/contracts/AudioDownloader";
import { ExternalApiError } from "@/shared/errors";
import { httpRequest } from "@/shared/http";

const DEFAULT_CONTENT_TYPE = "audio/mpeg";

/**
 * Fetches the generated audio from a provider's own (short-lived) URL,
 * on top of the shared `httpRequest` helper — the same timeout/retry
 * behavior as every other outbound call in this codebase. This class
 * never talks to R2 itself (see `CloudflareR2Storage`, untouched by this
 * sprint) — it only produces bytes for `GenerationPoller` to hand off to
 * storage.
 */
export class HttpAudioDownloader implements AudioDownloader {
  async download(url: string): Promise<DownloadedAudio> {
    const response = await httpRequest(url, { method: "GET" });

    if (!response.ok) {
      throw new ExternalApiError(`Audio download responded with status ${response.status}.`, {
        code: "audio_download.failed",
        context: { url, status: response.status },
      });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || DEFAULT_CONTENT_TYPE;

    return { bytes: new Uint8Array(buffer), contentType };
  }
}
