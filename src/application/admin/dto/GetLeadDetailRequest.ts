/** Boundary-facing input for `GetLeadDetailUseCase`. */
export interface GetLeadDetailRequest {
  leadId: string;
  /** The admin performing the lookup — recorded in the audit trail (see docs/Product/User_Flow.md). */
  viewingAdminId: string;
}
