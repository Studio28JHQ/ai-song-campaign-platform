import { ValidationError } from "@/shared/errors";
import type { AdminLyricsListGate } from "../contracts/AdminLyricsListGate";
import type { ListLyricsRequest, ListLyricsResponse } from "../dto/ListLyricsResponse";

export const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Loads a page of lyrics versions for the admin "Letras" screen. Pure
 * read, no mutation.
 *
 * Sprint FINAL-1 — Production Hardening: added pagination and
 * free-text search — a hard-capped, unfiltered list of 200 stopped
 * being usable once the campaign passes that many leads. This use case
 * only validates/normalizes pagination bounds, the same pattern
 * `SearchLeadsUseCase`/`ListSongsUseCase` already follow — the actual
 * query is the `AdminLyricsListGate`'s job.
 */
export class ListLyricsUseCase {
  constructor(private readonly lyricsListGate: AdminLyricsListGate) {}

  async execute(request: ListLyricsRequest): Promise<ListLyricsResponse> {
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

    const { items, total } = await this.lyricsListGate.list({
      page,
      pageSize,
      query: request.query?.trim() || undefined,
    });

    return { items, total, page, pageSize };
  }
}
