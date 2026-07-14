/** Boundary-facing input for `ResendSongEmailUseCase`. */
export interface ResendSongEmailRequest {
  songId: string;
  /** The admin performing the resend — recorded in the audit trail (see docs/Product/User_Flow.md). */
  adminId: string;
  /** Why this manual copy was requested — recorded alongside "Resent By"/"Resent At". */
  reason: string;
}
