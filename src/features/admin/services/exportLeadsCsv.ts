import { appendLeadFilterParams, type LeadFilterCriteria } from "./leadFilters";

/** Builds the CSV export URL for the current filters (see docs/Product/User_Flow.md — Export). The browser downloads it natively via the response's `Content-Disposition` header — no client-side blob handling needed. */
export function buildLeadsExportUrl(filters: LeadFilterCriteria): string {
  const params = new URLSearchParams();
  appendLeadFilterParams(params, filters);
  const query = params.toString();
  return query ? `/api/admin/leads/export?${query}` : "/api/admin/leads/export";
}
