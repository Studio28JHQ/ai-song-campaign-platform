import type { Lead } from "../entities/Lead";
import type { Email } from "../value-objects/Email";

/**
 * Persistence contract for the Lead aggregate. Interface only — no
 * implementation. A concrete adapter (Prisma or otherwise) belongs in
 * `src/infrastructure/`, not here.
 */
export interface LeadRepository {
  findById(id: string): Promise<Lead | null>;
  findByEmail(email: Email): Promise<Lead | null>;
  existsByEmail(email: Email): Promise<boolean>;
  create(lead: Lead): Promise<Lead>;
  update(lead: Lead): Promise<Lead>;
  /**
   * Atomically persists `lead` (already mutated in memory, e.g. via
   * `consumeAttempt()`) only if its `remainingAttempts` in the database
   * still equals `expectedRemainingAttempts` — the value read before that
   * mutation. Returns the persisted `Lead` on success, or `null` if a
   * concurrent request already consumed an attempt first, which the
   * caller must treat as a conflict rather than silently overwrite.
   */
  updateAttemptConsumption(lead: Lead, expectedRemainingAttempts: number): Promise<Lead | null>;
}
