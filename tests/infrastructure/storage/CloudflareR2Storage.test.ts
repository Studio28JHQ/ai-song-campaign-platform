import { describe, expect, it, vi } from "vitest";
import type { StorageClient } from "@/infrastructure/storage/StorageClient";
import { CloudflareR2Storage } from "@/infrastructure/storage/CloudflareR2Storage";

function fakeClient(overrides: Partial<StorageClient> = {}): StorageClient {
  return {
    putObject: vi.fn().mockResolvedValue(undefined),
    headObject: vi.fn().mockResolvedValue(true),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue("https://signed.example/key?sig=abc"),
    ...overrides,
  } as unknown as StorageClient;
}

describe("CloudflareR2Storage", () => {
  it("upload: calls the client once with the given key/content/contentType", async () => {
    const client = fakeClient();
    const storage = new CloudflareR2Storage(client);

    await storage.upload("songs/test.txt", "hello", "text/plain");

    expect(client.putObject).toHaveBeenCalledWith("songs/test.txt", "hello", "text/plain");
  });

  it("upload: wraps a client failure in the shared ExternalApiError", async () => {
    const client = fakeClient({ putObject: vi.fn().mockRejectedValue(new Error("boom")) });
    const storage = new CloudflareR2Storage(client);

    await expect(storage.upload("k", "v", "text/plain")).rejects.toThrow();
  });

  it("generateSignedDownloadUrl: returns a short-lived signed URL from the client, never a public URL", async () => {
    const client = fakeClient();
    const storage = new CloudflareR2Storage(client);

    const url = await storage.generateSignedDownloadUrl("songs/test.txt");

    expect(client.getSignedDownloadUrl).toHaveBeenCalledWith("songs/test.txt");
    expect(url).toBe("https://signed.example/key?sig=abc");
  });

  it("delete: calls the client once with the given key", async () => {
    const client = fakeClient();
    const storage = new CloudflareR2Storage(client);

    await storage.delete("songs/test.txt");

    expect(client.deleteObject).toHaveBeenCalledWith("songs/test.txt");
  });

  it("exists: returns true when the client finds the object", async () => {
    const client = fakeClient({ headObject: vi.fn().mockResolvedValue(true) });
    const storage = new CloudflareR2Storage(client);

    await expect(storage.exists("songs/test.txt")).resolves.toBe(true);
  });

  it("exists: returns false when the client does not find the object", async () => {
    const client = fakeClient({ headObject: vi.fn().mockResolvedValue(false) });
    const storage = new CloudflareR2Storage(client);

    await expect(storage.exists("songs/missing.txt")).resolves.toBe(false);
  });
});
