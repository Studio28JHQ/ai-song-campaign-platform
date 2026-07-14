/** Boundary-facing input for `RetryFailedSongUseCase`. */
export interface RetryFailedSongRequest {
  songId: string;
  /** The admin performing the retry — recorded in the audit trail (see docs/Product/User_Flow.md). */
  adminId: string;
}
