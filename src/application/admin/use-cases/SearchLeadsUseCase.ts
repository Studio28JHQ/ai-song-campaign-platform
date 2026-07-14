import { ValidationError } from "@/shared/errors";
import type { AdminLeadSearchGate } from "../contracts/AdminLeadSearchGate";
import type { SearchLeadsRequest } from "../dto/SearchLeadsRequest";
import type { SearchLeadsResponse } from "../dto/SearchLeadsResponse";

export const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Searches participants by parent name, baby name, email, or phone, with
 * pagination and sorting (see docs/Product/User_Flow.md — Search). This
 * use case only validates and normalizes pagination bounds; the actual
 * query — a join across Lead and Song — is the `AdminLeadSearchGate`'s
 * job.
 */
export class SearchLeadsUseCase {
  constructor(private readonly searchGate: AdminLeadSearchGate) {}

  async execute(request: SearchLeadsRequest): Promise<SearchLeadsResponse> {
    const page = request.page;
    const pageSize = request.pageSize ?? DEFAULT_PAGE_SIZE;

    if (!Number.isInteger(page) || page < 1) {
      throw new ValidationError("page must be a positive integer.", {
        code: "admin.invalid_page",
        context: { page },
      });
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new ValidationError(`pageSize must be between 1 and ${MAX_PAGE_SIZE}.`, {
        code: "admin.invalid_page_size",
        context: { pageSize },
      });
    }

    const result = await this.searchGate.search({
      query: request.query?.trim() || undefined,
      page,
      pageSize,
      sortBy: request.sortBy,
      sortDirection: request.sortDirection,
    });

    return { items: result.items, total: result.total, page, pageSize };
  }
}
