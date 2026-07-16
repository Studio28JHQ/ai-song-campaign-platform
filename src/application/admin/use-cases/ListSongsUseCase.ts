import type { AudioUrlResolver } from "@/application/song/contracts/AudioUrlResolver";
import type { AdminSongListGate } from "../contracts/AdminSongListGate";
import type { ListSongsResponse } from "../dto/ListSongsResponse";

const DEFAULT_LIMIT = 200;

/**
 * Loads the most recent songs for the admin "Canciones" screen —
 * status, provider, dates, and a freshly resolved signed download URL
 * (Sprint 9.1 — never the raw R2 key, never persisted), reusing the
 * exact same `AudioUrlResolver` seam `GetLeadDetailUseCase`/
 * `ResendSongEmailUseCase` already use.
 */
export class ListSongsUseCase {
  constructor(
    private readonly songListGate: AdminSongListGate,
    private readonly audioUrlResolver: AudioUrlResolver,
  ) {}

  async execute(): Promise<ListSongsResponse> {
    const rows = await this.songListGate.list(DEFAULT_LIMIT);

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
        emailedAt: row.emailedAt,
      })),
    );

    return { items };
  }
}
