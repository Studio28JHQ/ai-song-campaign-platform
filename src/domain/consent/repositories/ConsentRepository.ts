import type { Consent } from "../entities/Consent";

/**
 * Persistence contract for the Consent aggregate. Interface only — no
 * implementation. A concrete adapter (Prisma or otherwise) belongs in
 * `src/infrastructure/`, not here.
 */
export interface ConsentRepository {
  findBySessionId(sessionId: string): Promise<Consent | null>;
  create(consent: Consent): Promise<Consent>;
  update(consent: Consent): Promise<Consent>;
}
