/**
 * Where the resume link should send the browser — both destinations
 * already reconstruct their full UI state dynamically from the backend
 * (`GET /api/leads/session`, see `GetLeadSessionStateUseCase`), so this is
 * the only decision `ResolveResumeTokenUseCase` needs to make:
 * `/generate` covers "no lyrics yet" and "lyrics awaiting approval";
 * `/song` covers "song generating" and "song completed" — exactly
 * mirroring the destination `useApproveLyrics` already navigates to on
 * approval.
 */
export type ResumeDestination = "generate" | "song";

export interface ResolveResumeTokenResponse {
  leadId: string;
  destination: ResumeDestination;
}
