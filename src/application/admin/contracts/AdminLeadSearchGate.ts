import type { AdminLeadFilterCriteria } from "./AdminLeadFilterCriteria";

export type AdminLeadSortField = "createdAt" | "parentName" | "babyName" | "email" | "songStatus";
export type AdminLeadSortDirection = "asc" | "desc";

export interface AdminLeadSearchFilter extends AdminLeadFilterCriteria {
  page: number;
  pageSize: number;
  sortBy?: AdminLeadSortField;
  sortDirection?: AdminLeadSortDirection;
}

/** One row of the admin lead search table — a read model, not a domain entity. */
export interface AdminLeadRow {
  id: string;
  createdAt: Date;
  parentName: string;
  babyName: string;
  email: string;
  phone: string | null;
  /** Public song-status vocabulary (PENDING/GENERATING/COMPLETED/FAILED), or `null` if no song has been started yet. */
  songStatus: string | null;
  emailSent: boolean;
}

export interface AdminLeadSearchResult {
  items: AdminLeadRow[];
  total: number;
}

/**
 * What `SearchLeadsUseCase` needs — a paginated, sortable, searchable,
 * filterable join across Lead and Song. No existing repository supports
 * this (the domain `LeadRepository`/`SongRepository` intentionally
 * don't, since no other module needs pagination/sorting/full-text
 * search/filtering), so this is a narrow, admin-specific read-model
 * port, satisfied by a thin Prisma-backed adapter in
 * `src/infrastructure/`.
 */
export interface AdminLeadSearchGate {
  search(filter: AdminLeadSearchFilter): Promise<AdminLeadSearchResult>;
}
