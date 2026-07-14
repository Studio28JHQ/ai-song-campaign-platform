import { afterEach, describe, expect, it, vi } from "vitest";

const mockSend = vi.fn();
const mockGetSignedUrl = vi.fn();

class FakeS3Client {
  send = mockSend;
}

vi.mock("@aws-sdk/client-s3", async () => {
  const actual = await vi.importActual<typeof import("@aws-sdk/client-s3")>("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: FakeS3Client,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

const { StorageClient } = await import("@/infrastructure/storage/StorageClient");

describe("StorageClient", () => {
  afterEach(() => {
    mockSend.mockReset();
    mockGetSignedUrl.mockReset();
  });

  it("putObject: sends a PutObjectCommand and resolves on success", async () => {
    mockSend.mockResolvedValue({});
    const client = new StorageClient();

    await expect(client.putObject("k", "content", "text/plain")).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("headObject: returns true when the object exists", async () => {
    mockSend.mockResolvedValue({});
    const client = new StorageClient();

    await expect(client.headObject("k")).resolves.toBe(true);
  });

  it("headObject: returns false (not a thrown error) when the object is not found", async () => {
    mockSend.mockRejectedValue({ name: "NotFound", $metadata: { httpStatusCode: 404 } });
    const client = new StorageClient();

    await expect(client.headObject("missing")).resolves.toBe(false);
  });

  it("headObject: rethrows any other failure", async () => {
    mockSend.mockRejectedValue(new Error("network error"));
    const client = new StorageClient();

    await expect(client.headObject("k")).rejects.toThrow("network error");
  });

  it("deleteObject: sends a DeleteObjectCommand and resolves on success", async () => {
    mockSend.mockResolvedValue({});
    const client = new StorageClient();

    await expect(client.deleteObject("k")).resolves.toBeUndefined();
  });

  it("getSignedDownloadUrl: returns a presigned URL and never a public bucket URL", async () => {
    mockGetSignedUrl.mockResolvedValue("https://signed.example/k?X-Amz-Signature=abc");
    const client = new StorageClient();

    const url = await client.getSignedDownloadUrl("k");

    expect(url).toBe("https://signed.example/k?X-Amz-Signature=abc");
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    const [, , options] = mockGetSignedUrl.mock.calls[0];
    expect(options.expiresIn).toBeGreaterThan(0);
  });
});
