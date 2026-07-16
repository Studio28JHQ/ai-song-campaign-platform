import type { AdminLyricsListGate } from "../contracts/AdminLyricsListGate";
import type { ListLyricsResponse } from "../dto/ListLyricsResponse";

const DEFAULT_LIMIT = 200;

/** Loads the most recent lyrics versions for the admin "Letras" screen. Pure read, no mutation. */
export class ListLyricsUseCase {
  constructor(private readonly lyricsListGate: AdminLyricsListGate) {}

  async execute(): Promise<ListLyricsResponse> {
    const items = await this.lyricsListGate.list(DEFAULT_LIMIT);
    return { items };
  }
}
