import { BusinessRuleError } from "@/shared/errors";
import type { SongGenerationProvider } from "../contracts/SongGenerationProvider";

/**
 * Resolves a provider name to its adapter. Deliberately the smallest
 * thing that does the job: a lookup with one controlled failure mode, not
 * a strategy layer.
 *
 * Two call sites, with different questions:
 * - `GenerationDispatcher` asks for the campaign's configured primary
 *   (and, on a whitelisted failure, its fallback).
 * - `GenerationPoller` asks for `song.provider` — the provider that
 *   actually generated that song. It never asks what the current primary
 *   is, which is what makes a routing change safe for songs already in
 *   flight.
 *
 * A name with no adapter registered (a value that predates the current
 * provider set, e.g. the legacy `"suno"`, or a typo written straight into
 * the database) raises `song.unknown_provider` rather than dereferencing
 * `undefined`, so the failure is a readable business error on a single
 * song instead of a crash that stalls the whole tick.
 */
export class SongGenerationProviderRegistry {
  private readonly providers: Map<string, SongGenerationProvider>;

  constructor(providers: ReadonlyArray<SongGenerationProvider>) {
    this.providers = new Map(providers.map((provider) => [provider.name, provider]));
  }

  get(name: string): SongGenerationProvider {
    const provider = this.providers.get(name);

    if (!provider) {
      throw new BusinessRuleError(`No generation provider is registered as "${name}".`, {
        code: "song.unknown_provider",
        context: { requested: name, registered: [...this.providers.keys()] },
      });
    }

    return provider;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }
}
