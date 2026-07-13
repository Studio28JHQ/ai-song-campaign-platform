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
}
