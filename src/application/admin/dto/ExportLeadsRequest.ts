import type { AdminLeadFilterCriteria } from "../contracts/AdminLeadFilterCriteria";

/** Boundary-facing input for `ExportLeadsUseCase` — the same filter criteria the search table uses (see docs/Product/User_Flow.md — Filters, Export). */
export type ExportLeadsRequest = AdminLeadFilterCriteria;
