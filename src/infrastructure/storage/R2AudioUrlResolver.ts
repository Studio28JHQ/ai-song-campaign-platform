import type { AudioUrlResolver } from "@/application/song/contracts/AudioUrlResolver";
import { CloudflareR2Storage } from "./CloudflareR2Storage";

/**
 * Resolves a persisted R2 object key into a fresh signed download URL,
 * generated on demand — never persisted (see `AudioUrlResolver`). Thin
 * wrapper around the existing, untouched `CloudflareR2Storage`; this
 * file is new, `CloudflareR2Storage` itself is not modified by Sprint
 * 9.1.
 */
export class R2AudioUrlResolver implements AudioUrlResolver {
  constructor(private readonly storage: CloudflareR2Storage = new CloudflareR2Storage()) {}

  async resolve(storageKey: string): Promise<string> {
    return this.storage.generateSignedDownloadUrl(storageKey);
  }
}
