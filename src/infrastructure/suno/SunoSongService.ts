import type {
  SongGenerationInput,
  SongGenerationPollResult,
  SongGenerationProvider,
  SongGenerationSubmission,
} from "@/application/song/contracts/SongGenerationProvider";
import { PromptBuilder } from "./PromptBuilder";
import { ResponseParser } from "./ResponseParser";
import { SunoClient } from "./SunoClient";

/**
 * Generates exactly one song per call — never multiple variations (see
 * docs/Product/Business_Rules.md — Song Rules). Uses the approved lyrics
 * exactly as given; this class never regenerates or edits them.
 *
 * Suno's generation endpoint (as integrated here) is synchronous: the
 * one HTTP call in `submitGeneration` already returns the finished
 * result — there is no separate query-by-id endpoint to poll. To satisfy
 * `SongGenerationProvider`'s submit/poll contract (Sprint 9.1) without
 * inventing a second call Suno doesn't actually offer, the already-known
 * result is cached here, keyed by `providerTaskId`, so
 * `pollGenerationStatus` can return it without any further network
 * call. This is a documented characteristic of Suno's adapter, not a
 * general pattern — a real async provider (e.g. a future Mureka
 * adapter) will genuinely poll a remote endpoint instead. The cache is
 * process-local and only ever populated by this same instance's own
 * `submitGeneration` call, so it only helps when the dispatcher and
 * poller run within the same process lifetime (true for this app's
 * current `after()`-scheduled invocation — see `GenerationDispatcher`
 * and `GenerationPoller`); it deliberately does not attempt to survive
 * across separate processes, which Suno's synchronous API has no way to
 * support anyway.
 */
export class SunoSongService implements SongGenerationProvider {
  private readonly completedResults = new Map<string, SongGenerationPollResult>();

  constructor(private readonly client: SunoClient = new SunoClient()) {}

  async submitGeneration(input: SongGenerationInput): Promise<SongGenerationSubmission> {
    const payload = PromptBuilder.build(input);
    const raw = await this.client.generate(payload);
    const result = ResponseParser.parse(raw);

    this.completedResults.set(result.providerSongId, {
      status: "completed",
      providerSongId: result.providerSongId,
      audioUrl: result.audioUrl,
      duration: result.duration,
    });

    return { providerTaskId: result.providerSongId, providerTraceId: null };
  }

  async pollGenerationStatus(providerTaskId: string): Promise<SongGenerationPollResult> {
    return this.completedResults.get(providerTaskId) ?? { status: "pending" };
  }
}
