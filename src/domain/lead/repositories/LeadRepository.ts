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
}
