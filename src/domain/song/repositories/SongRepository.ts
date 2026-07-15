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
}
