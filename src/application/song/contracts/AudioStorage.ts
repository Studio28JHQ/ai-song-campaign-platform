/**
 * What `GenerationPoller` needs to persist generated audio — nothing
 * more. `CloudflareR2Storage` (`src/infrastructure/storage/`) already
 * satisfies this shape structurally; this port exists so the poller
 * depends only on an application-layer contract, never a concrete
 * infrastructure class, and can be constructed with a fake in tests.
 */
export interface AudioStorage {
  upload(key: string, content: Uint8Array, contentType: string): Promise<void>;
}
