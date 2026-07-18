import { appendLeadFilterParams, type LeadFilterCriteria } from "./leadFilters";

export type LeadSortField = "createdAt" | "parentName" | "babyName" | "email" | "songStatus";
export type LeadSortDirection = "asc" | "desc";

export interface SearchLeadsInput extends LeadFilterCriteria {
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

/**
 * Thin HTTP client for `GET /api/admin/leads`. No business rule is
 * evaluated here. Filters (see docs/Product/User_Flow.md — Filters)
 * always combine with the free-text query.
 */
export async function searchLeads(input: SearchLeadsInput): Promise<SearchLeadsResult> {
  const params = new URLSearchParams();
  appendLeadFilterParams(params, input);
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));
  if (input.sortBy) params.set("sortBy", input.sortBy);
  if (input.sortDirection) params.set("sortDirection", input.sortDirection);

  let response: Response;

  try {
    response = await fetch(`/api/admin/leads?${params.toString()}`);
  } catch {
    throw new SearchLeadsError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Algo salió mal.";
    throw new SearchLeadsError(message);
  }

  return body as SearchLeadsResult;
}
