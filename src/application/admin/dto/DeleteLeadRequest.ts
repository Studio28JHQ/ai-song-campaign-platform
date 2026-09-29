/** Input for `DeleteLeadUseCase` — the family to remove, and who is removing it. */
export interface DeleteLeadRequest {
  leadId: string;
  adminId: string;
}
