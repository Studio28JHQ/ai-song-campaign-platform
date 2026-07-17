import type { Song } from "../entities/Song";

/**
 * Persistence contract for the Song aggregate. Interface only — no
 * implementation. A concrete adapter (Prisma or otherwise) belongs in
 * `src/infrastructure/`, not here.
 */
export interface SongRepository {
  create(song: Song): Promise<Song>;
  findById(id: string): Promise<Song | null>;
  findByLead(leadId: string): Promise<Song | null>;
  update(song: Song): Promise<Song>;
  /** The song currently `GENERATING`, if any — used to enforce the provider's one-concurrent-generation limit (see `GenerationDispatcher`/`GenerationPoller`). */
  findGenerating(): Promise<Song | null>;
  /** The oldest `QUEUED` song, if any, ordered by `createdAt` ascending — the queue's "next up". */
  findOldestQueued(): Promise<Song | null>;
  /**
   * Atomically persists `song` (already transitioned in memory, e.g. via
   * `markGenerating()`) only if the row is still `QUEUED` at the database
   * level. Returns the persisted `Song` on a successful claim, or `null` if
   * another dispatcher run already claimed it first — this is what prevents
   * two concurrent runs from ever submitting the same song twice.
   */
  claimQueued(song: Song): Promise<Song | null>;
}
