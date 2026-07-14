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

export interface LeadDetailAuditEntry {
  id: string;
  adminId: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface LeadDetailResult {
  lead: LeadDetailLead;
  lyricsHistory: LeadDetailLyrics[];
  approvedLyrics: LeadDetailLyrics | null;
  song: LeadDetailSong | null;
  auditHistory: LeadDetailAuditEntry[];
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
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { error?: unknown; message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Something went wrong.";
    throw new GetLeadDetailError(message, record.error === "lead_not_found");
  }

  return body as LeadDetailResult;
}
