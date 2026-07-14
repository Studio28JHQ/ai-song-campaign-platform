/** Output of `ResendSongEmailUseCase`. Nothing to carry beyond confirmation — the resend is fire-and-forget from the caller's perspective. */
export interface ResendSongEmailResponse {
  success: true;
}
