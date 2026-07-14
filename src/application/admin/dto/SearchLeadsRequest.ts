import type { AdminLeadSortDirection, AdminLeadSortField } from "../contracts/AdminLeadSearchGate";
import type {
  AdminLeadEmailStatusFilter,
  AdminLeadSongStatusFilter,
} from "../contracts/AdminLeadFilterCriteria";

/** Boundary-facing input for `SearchLeadsUseCase`. Filters (see docs/Product/User_Flow.md — Filters) always combine with the free-text `query`, never replace it. */
export interface SearchLeadsRequest {
  query?: string;
  dateFrom?: Date;
  dateTo?: Date;
  songStatus?: AdminLeadSongStatusFilter;
  emailStatus?: AdminLeadEmailStatusFilter;
  city?: string;
  page: number;
  pageSize: number;
  sortBy?: AdminLeadSortField;
  sortDirection?: AdminLeadSortDirection;
}
