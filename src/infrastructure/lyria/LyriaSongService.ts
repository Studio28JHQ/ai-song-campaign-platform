import type {
  SongGenerationInput,
  SongGenerationProvider,
  SongGenerationSubmission,
} from "@/application/song/contracts/SongGenerationProvider";
import { logger } from "@/shared/logger/logger";
import { LyriaClient } from "./LyriaClient";
import { PromptBuilder } from "./PromptBuilder";
import { ResponseParser } from "./ResponseParser";
import { LYRIA_MODEL } from "./types";

/**
 * Google Lyria as a `SongGenerationProvider` — the campaign's second
 * provider, orchestrating the three classes beside it: build the prompt →
 * call Lyria → parse the response. The same shape `MurekaSongService` uses,
 * with one deliberate difference.
 *
 * **No `pollGenerationStatus`.** Lyria's Interactions API is synchronous and
 * single-turn: `submitGeneration` returns the finished audio, so there is no
 * task for `GenerationPoller` to ask about. The port declares that method
 * optional precisely so this adapter can omit it rather than ship a stub
 * that throws — and because a Lyria song never sits in `GENERATING` between
 * invocations, the poller never looks for one.
 *
 * What this class does *not* do is just as important: it does not touch R2,
 * does not process audio, and does not send anything. It hands bytes to the
 * application layer, which runs them through the same FFmpeg → R2 → email
 * path as Mureka's audio.
 */
export class LyriaSongService implements SongGenerationProvider {
  /** Persisted on `Song.provider`, and the key this adapter is registered under. */
  readonly name = "lyria" as const;
  /** Persisted on `Song.providerModel`. */
  readonly model = LYRIA_MODEL;

  constructor(private readonly client: LyriaClient = new LyriaClient()) {}

  async submitGeneration(input: SongGenerationInput): Promise<SongGenerationSubmission> {
    const prompt = PromptBuilder.build(input);
    const raw = await this.client.generate(prompt);
    const submission = ResponseParser.parse(raw);

    // Never the prompt, never the lyrics, never the audio, never the
    // credential — only sizes and identifiers.
    logger.info("Lyria returned a generated song", {
      provider: this.name,
      providerModel: this.model,
      providerSongId: submission.kind === "immediate" ? submission.providerSongId : null,
      audioBytes: submission.kind === "immediate" ? submission.audio.bytes.length : null,
      contentType: submission.kind === "immediate" ? submission.audio.contentType : null,
    });

    return submission;
  }
}
