import type { AdminLeadRow } from "../contracts/AdminLeadSearchGate";

/** Output of `SearchLeadsUseCase`. */
export interface SearchLeadsResponse {
  items: AdminLeadRow[];
  total: number;
  page: number;
  pageSize: number;
}
