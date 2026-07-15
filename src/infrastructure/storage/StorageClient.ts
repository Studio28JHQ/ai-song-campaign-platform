import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { appConfig } from "@/config/app";
import { R2_SIGNED_URL_EXPIRY_SECONDS } from "@/config/constants";

/**
 * Minimal wrapper around the official `@aws-sdk/client-s3` client, talking
 * to Cloudflare R2's S3-compatible API and nothing else — consistent with
 * the Claude/Mureka/Resend clients' "one class per external call" shape.
 * The bucket is never made public: `getSignedDownloadUrl` is the only way
 * this class ever produces a URL, and it always expires.
 */
export class StorageClient {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: "auto",
      endpoint: appConfig.storage.endpoint,
      credentials: {
        accessKeyId: appConfig.storage.accessKeyId,
        secretAccessKey: appConfig.storage.secretAccessKey,
      },
    });
  }

  async putObject(key: string, body: string | Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: appConfig.storage.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async headObject(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: appConfig.storage.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: appConfig.storage.bucket, Key: key }));
  }

  async getSignedDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: appConfig.storage.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: R2_SIGNED_URL_EXPIRY_SECONDS });
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  const statusCode = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  return name === "NotFound" || name === "NoSuchKey" || statusCode === 404;
}
