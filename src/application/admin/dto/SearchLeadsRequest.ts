import type { AdminLeadSortDirection, AdminLeadSortField } from "../contracts/AdminLeadSearchGate";

/** Boundary-facing input for `SearchLeadsUseCase`. */
export interface SearchLeadsRequest {
  query?: string;
  page: number;
  pageSize: number;
  sortBy?: AdminLeadSortField;
  sortDirection?: AdminLeadSortDirection;
}
