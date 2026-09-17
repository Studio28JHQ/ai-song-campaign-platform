export interface LeadSessionApprovedLyrics {
  id: string;
  content: string;
  version: number;
}

export type LeadSessionSongStatus = "QUEUED" | "GENERATING" | "COMPLETED" | "FAILED";

export interface LeadSessionSong {
  songId: string;
  status: LeadSessionSongStatus;
  audioUrl?: string;
  duration?: number | null;
}

/**
 * A generated version still awaiting the parent's approval. Carries the
 * three extra fields needed to rebuild the request that produced it, so
 * "Quiero otra versión" regenerates with the same parameters after a
 * resume — see `PendingLyricsSummary` (application layer) for why these
 * three and no others.
 */
export interface LeadSessionPendingLyrics extends LeadSessionApprovedLyrics {
  moodId: string;
  /** `null` for a version generated before the message was persisted — it cannot be regenerated from. */
  parentMessage: string | null;
  voice: "FEMALE" | "MALE";
}

export interface LeadSessionState {
  babyName: string;
  remainingAttempts: number;
  leadStatus: string;
  approvedLyrics: LeadSessionApprovedLyrics | null;
  pendingLyrics: LeadSessionPendingLyrics | null;
  song: LeadSessionSong | null;
}

/**
 * Thin HTTP client for `GET /api/leads/session` — the backend authority
 * for the parent-facing flow (see GATE 6.6). Returns `null` when there is
 * no active session (missing/unknown/expired cookie), which every caller
 * treats identically to "not registered yet". No Lead id is ever read
 * from or sent by the browser; the session cookie identifies the lead
 * entirely server-side.
 */
export async function getLeadSession(): Promise<LeadSessionState | null> {
  let response: Response;

  try {
    response = await fetch("/api/leads/session");
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as LeadSessionState | null;
}
