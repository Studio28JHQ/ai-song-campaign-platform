import type { SongGenerationInput } from "@/application/song/contracts/SongGenerationProvider";
import { logger } from "@/shared/logger/logger";
import { MurekaClient } from "./MurekaClient";
import { PromptBuilder } from "./PromptBuilder";
import { ResponseParser } from "./ResponseParser";
import type { MurekaSubmissionResult } from "./types";

/**
 * Official Mureka async music generation provider (Gate 9.2 — Mureka
 * Foundation). Orchestrates the three classes above: build payload →
 * call Mureka → parse response — the same "build payload → call
 * provider → parse response" shape as `SunoSongService`/
 * `ClaudeLyricsService`.
 *
 * This gate covers submission only: `submitGeneration` accepts a
 * generation job and returns the structured result once Mureka
 * confirms it — `providerTaskId`, `providerTraceId`, `submittedAt`, and
 * the initial `providerStatus`, all already translated out of Mureka's
 * raw response shape (see `ResponseParser`). It is not wired into any
 * Application use case yet, and does not implement the
 * `SongGenerationProvider` port (`GenerationDispatcher`/
 * `GenerationPoller`, untouched by this gate, still use
 * `SunoSongService`) — polling, download, and email remain out of
 * scope here, mirroring how `ClaudeLyricsService` isn't wired into an
 * application-layer port until its own use case exists.
 */
export class MurekaSongService {
  constructor(private readonly client: MurekaClient = new MurekaClient()) {}

  async submitGeneration(input: SongGenerationInput): Promise<MurekaSubmissionResult> {
    const payload = PromptBuilder.build(input);
    const raw = await this.client.submitGeneration(payload);
    const result = ResponseParser.parse(raw);

    logger.info("Mureka accepted a song generation submission", {
      providerTaskId: result.providerTaskId,
      providerTraceId: result.providerTraceId,
      submittedAt: result.submittedAt.toISOString(),
      providerStatus: result.providerStatus,
    });

    return result;
  }
}
