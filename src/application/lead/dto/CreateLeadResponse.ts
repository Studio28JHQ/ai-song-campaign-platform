import type { LeadSnapshot } from "@/domain/lead/types";

/**
 * Boundary-facing output of `CreateLeadUseCase`. Carries a plain
 * `LeadSnapshot`, not the `Lead` entity itself — callers outside the
 * application layer (a future API route) should never receive domain
 * objects directly.
 */
export interface CreateLeadResponse {
  lead: LeadSnapshot;
}
