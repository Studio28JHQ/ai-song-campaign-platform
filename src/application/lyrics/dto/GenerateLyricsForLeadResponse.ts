import type { LeadStatus } from "@/domain/lead/types";
import type { LyricsSnapshot } from "@/domain/lyrics/types";

/**
 * Boundary-facing output of `GenerateLyricsForLeadUseCase`. `lyrics` is
 * `null` when the request was moderated out — that is a normal, expected
 * outcome, not an error, so the caller still gets `reason` and the lead's
 * updated attempt count/status back.
 */
export interface GenerateLyricsForLeadResponse {
  lyrics: LyricsSnapshot | null;
  approved: boolean;
  reason: string | null;
  remainingAttempts: number;
  leadStatus: LeadStatus;
}
