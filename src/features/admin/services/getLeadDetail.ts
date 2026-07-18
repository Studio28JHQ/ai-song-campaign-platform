export interface LeadDetailLead {
  id: string;
  campaignId: string;
  parentName: string;
  babyName: string;
  babyAge: number | null;
  city: string | null;
  email: string;
  phone: string | null;
  remainingAttempts: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadDetailLyrics {
  id: string;
  leadId: string;
  moodId: string;
  prompt: string;
  content: string;
  approved: boolean;
  rejectionReason: string | null;
  version: number;
  createdAt: string;
}

export interface LeadDetailSong {
  id: string;
  leadId: string;
  lyricsId: string;
  moodId: string;
  provider: string;
  providerSongId: string | null;
  audioUrl: string | null;
  duration: number | null;
  status: string;
  generatedAt: string | null;
  emailedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ExecutionHistoryEventType =
  | "lead_created"
  | "lyrics_generated"
  | "lyrics_approved"
  | "song_requested"
  | "song_completed"
  | "song_failed"
  | "email_sent_automatic"
  | "email_resent_manual"
  | "song_retried"
  | "lead_viewed";

export interface LeadDetailExecutionHistoryItem {
  type: ExecutionHistoryEventType;
  label: string;
  timestamp: string;
  actor: string | null;
  detail?: string | null;
}

export interface LeadDetailResult {
  lead: LeadDetailLead;
  lyricsHistory: LeadDetailLyrics[];
  approvedLyrics: LeadDetailLyrics | null;
  song: LeadDetailSong | null;
  executionHistory: LeadDetailExecutionHistoryItem[];
}

export class GetLeadDetailError extends Error {
  constructor(
    message: string,
    public readonly notFound: boolean = false,
  ) {
    super(message);
    this.name = "GetLeadDetailError";
  }
}

/** Thin HTTP client for `GET /api/admin/leads/{leadId}`. No business rule is evaluated here. */
export async function getLeadDetail(leadId: string): Promise<LeadDetailResult> {
  let response: Response;

  try {
    response = await fetch(`/api/admin/leads/${leadId}`);
  } catch {
    throw new GetLeadDetailError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown; message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Algo salió mal.";
    throw new GetLeadDetailError(message, record.error === "lead_not_found");
  }

  return body as LeadDetailResult;
}
