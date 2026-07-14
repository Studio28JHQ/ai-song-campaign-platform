import { ExternalApiError } from "@/shared/errors";
import { StorageClient } from "./StorageClient";

/**
 * Private object storage for generated audio (Cloudflare R2, S3-compatible).
 * The bucket has no public access; `generateSignedDownloadUrl` is the only
 * way a caller ever gets a URL, and it always expires — see
 * `docs/Architecture/External_Services.md` — Cloudflare R2.
 *
 * Infrastructure only: no Application use case calls this yet (see
 * `docs/Architecture/System_Architecture.md`). Supports exactly four
 * operations, no others.
 */
export class CloudflareR2Storage {
  constructor(private readonly client: StorageClient = new StorageClient()) {}

  async upload(key: string, content: string | Uint8Array, contentType: string): Promise<void> {
    try {
      await this.client.putObject(key, content, contentType);
    } catch (cause) {
      throw new ExternalApiError("Cloudflare R2 upload failed.", {
        code: "r2.upload_failed",
        cause,
        context: { key },
      });
    }
  }

  async generateSignedDownloadUrl(key: string): Promise<string> {
    try {
      return await this.client.getSignedDownloadUrl(key);
    } catch (cause) {
      throw new ExternalApiError("Cloudflare R2 signed URL generation failed.", {
        code: "r2.signed_url_failed",
        cause,
        context: { key },
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.deleteObject(key);
    } catch (cause) {
      throw new ExternalApiError("Cloudflare R2 delete failed.", {
        code: "r2.delete_failed",
        cause,
        context: { key },
      });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return await this.client.headObject(key);
    } catch (cause) {
      throw new ExternalApiError("Cloudflare R2 existence check failed.", {
        code: "r2.exists_failed",
        cause,
        context: { key },
      });
    }
  }
}
