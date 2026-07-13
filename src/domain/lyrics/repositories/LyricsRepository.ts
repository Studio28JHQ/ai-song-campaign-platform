import type { Lyrics } from "../entities/Lyrics";

/**
 * Persistence contract for the Lyrics aggregate. Interface only — no
 * implementation. A concrete adapter (Prisma or otherwise) belongs in
 * `src/infrastructure/`, not here.
 */
export interface LyricsRepository {
  create(lyrics: Lyrics): Promise<Lyrics>;
  findById(id: string): Promise<Lyrics | null>;
  findAllByLead(leadId: string): Promise<Lyrics[]>;
  findApprovedByLead(leadId: string): Promise<Lyrics | null>;
  approve(lyrics: Lyrics): Promise<Lyrics>;
  reject(lyrics: Lyrics): Promise<Lyrics>;
}
