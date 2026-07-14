export type LeadSortField = "createdAt" | "parentName" | "babyName" | "email" | "songStatus";
export type LeadSortDirection = "asc" | "desc";

export interface SearchLeadsInput {
  query?: string;
  page: number;
  pageSize: number;
  sortBy?: LeadSortField;
  sortDirection?: LeadSortDirection;
}

export interface LeadRow {
  id: string;
  createdAt: string;
  parentName: string;
  babyName: string;
  email: string;
  phone: string | null;
  songStatus: string | null;
  emailSent: boolean;
}

export interface SearchLeadsResult {
  items: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
}

export class SearchLeadsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchLeadsError";
  }
}

/** Thin HTTP client for `GET /api/admin/leads`. No business rule is evaluated here. */
export async function searchLeads(input: SearchLeadsInput): Promise<SearchLeadsResult> {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));
  if (input.sortBy) params.set("sortBy", input.sortBy);
  if (input.sortDirection) params.set("sortDirection", input.sortDirection);

  let response: Response;

  try {
    response = await fetch(`/api/admin/leads?${params.toString()}`);
  } catch {
    throw new SearchLeadsError(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Something went wrong.";
    throw new SearchLeadsError(message);
  }

  return body as SearchLeadsResult;
}
