import type { AdminLeadDeletionSummary } from "../contracts/AdminLeadDeletionGate";

/** Output of `DeleteLeadUseCase` — the family as it was, for the confirmation message and the audit trail. */
export interface DeleteLeadResponse {
  deleted: AdminLeadDeletionSummary;
}
