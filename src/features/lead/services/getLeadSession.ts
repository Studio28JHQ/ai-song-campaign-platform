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
 * Why this is not `LeadSessionState | null`.
 *
 * It was, and that single `null` meant three different things: there is
 * no session (401), something of ours failed transiently (429, 5xx, a
 * dead network, an unreadable body), or the request never left. Only the
 * first is the parent's situation, but the caller could only read the
 * value one way — "not registered" — and answered it by sending them
 * back to the landing page. A parent whose registration had just
 * succeeded, with the welcome email already sent, was ejected mid-flow
 * with no message, and the only way back in was the link in that email.
 *
 * Splitting the result forces each case to be decided on purpose, and
 * stops a temporary failure from ever again being mistaken for a missing
 * registration.
 */
export type LeadSessionResult =
  /** The session resolved. */
  | { status: "ok"; state: LeadSessionState }
  /** HTTP 401 — no cookie, or one that no longer resolves. Genuinely "not registered". */
  | { status: "no_session" }
  /** Ours and transient: 429, 5xx, a network failure, or a 200 whose body would not parse. */
  | { status: "error" };

/**
 * Thin HTTP client for `GET /api/leads/session` — the backend authority
 * for the parent-facing flow (see GATE 6.6). No Lead id is ever read
 * from or sent by the browser; the session cookie identifies the lead
 * entirely server-side.
 */
export async function getLeadSession(): Promise<LeadSessionResult> {
  let response: Response;

  try {
    response = await fetch("/api/leads/session");
  } catch {
    return { status: "error" };
  }

  if (response.status === 401) return { status: "no_session" };
  if (!response.ok) return { status: "error" };

  const body = (await response.json().catch(() => null)) as LeadSessionState | null;
  // A 200 we cannot read is a failure of ours, not an absent
  // registration — the one case the old `null` came closest to getting
  // right and still drew the wrong conclusion from.
  if (!body) return { status: "error" };

  return { status: "ok", state: body };
}
