import { ValidationError } from "@/shared/errors";
import type { AudioUrlResolver } from "@/application/song/contracts/AudioUrlResolver";
import type { AdminSongListGate } from "../contracts/AdminSongListGate";
import type { ListSongsRequest, ListSongsResponse } from "../dto/ListSongsResponse";

export const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Loads a page of songs for the admin "Canciones" screen — status,
 * provider, dates, the provider's failure reason (if any), and a
 * freshly resolved signed download URL (Sprint 9.1 — never the raw R2
 * key, never persisted), reusing the exact same `AudioUrlResolver` seam
 * `GetLeadDetailUseCase`/`ResendSongEmailUseCase` already use.
 *
 * Sprint FINAL-1 — Production Hardening: added pagination, free-text
 * search, and status filtering — at 3,000 songs, a hard-capped,
 * unfiltered list stopped being usable for triaging failures at scale.
 * This use case only validates/normalizes pagination bounds, the same
 * pattern `SearchLeadsUseCase` already follows — the actual query is
 * the `AdminSongListGate`'s job.
 */
export class ListSongsUseCase {
  constructor(
    private readonly songListGate: AdminSongListGate,
    private readonly audioUrlResolver: AudioUrlResolver,
  ) {}

  async execute(request: ListSongsRequest): Promise<ListSongsResponse> {
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

    const { items: rows, total } = await this.songListGate.list({
      page,
      pageSize,
      query: request.query?.trim() || undefined,
      status: request.status,
    });

    const items = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        leadId: row.leadId,
        createdAt: row.createdAt,
        parentName: row.parentName,
        babyName: row.babyName,
        status: row.status,
        provider: row.provider,
        audioUrl: row.audioStorageKey
          ? await this.audioUrlResolver.resolve(row.audioStorageKey)
          : null,
        providerError: row.providerError,
        emailedAt: row.emailedAt,
      })),
    );

    return { items, total, page, pageSize };
  }
}
