/**
 * What the generation pipeline needs from a music generation provider —
 * nothing more. Keeps `GenerationDispatcher`/`GenerationPoller` decoupled
 * from any concrete provider (Mureka, the sole active provider — see
 * PROJECT_MANIFEST.md), so both can be constructed with a fake in tests
 * and the provider swapped later without changing this file or either
 * use case. No provider-specific name, type, or logic belongs in this
 * file — that lives entirely in `src/infrastructure/` (e.g.
 * `MurekaSongService`).
 *
 * Sprint 9.1 — Generation Pipeline Refinement: submission and polling
 * are two separate calls, matching how an async, task-based provider
 * (Mureka) actually works — submit a job, then poll it until it
 * reaches a terminal state. `GenerationDispatcher` only ever calls
 * `submitGeneration`; `GenerationPoller` only ever calls
 * `pollGenerationStatus`. Neither call blocks waiting for the other.
 */
export interface SongGenerationInput {
  lyrics: string;
  moodName: string;
  sunoPrompt: string;
}

/** What a provider returns once it has accepted a generation job — before it has finished. */
export interface SongGenerationSubmission {
  providerTaskId: string;
  providerTraceId: string | null;
}

/**
 * The result of asking a provider "is this job done yet?". A `completed`
 * result still carries the provider's own (short-lived) `audioUrl` —
 * `GenerationPoller`'s job is to download it and persist only the
 * resulting R2 object key; this type never itself gets persisted.
 *
 * `ready_to_download` is a distinct terminal-success signal from
 * `completed`: the provider itself has finished asynchronously,
 * separately from the request that started it, rather than returning
 * the finished result inline like `completed` does — this is Mureka's
 * actual result, since it's a genuinely asynchronous, task-based
 * provider. `completed` remains supported for a hypothetical future
 * synchronous provider; `GenerationPoller` handles both variants
 * identically — download, upload to R2, mark `COMPLETED`, deliver the
 * "song ready" email (Gate 9.5 — Complete End-to-End Song Delivery); see
 * `GenerationPoller` for the full rationale. `providerStatus` on
 * `pending`/`ready_to_download` is the provider's own raw status
 * string, for diagnostics only.
 */
export type SongGenerationPollResult =
  | { status: "pending"; providerStatus?: string }
  | { status: "completed"; providerSongId: string; audioUrl: string; duration: number | null }
  | {
      status: "ready_to_download";
      providerSongId: string;
      audioUrl: string;
      duration: number | null;
      providerStatus?: string;
    }
  | { status: "failed"; error: string };

export interface SongGenerationProvider {
  submitGeneration(input: SongGenerationInput): Promise<SongGenerationSubmission>;
  pollGenerationStatus(providerTaskId: string): Promise<SongGenerationPollResult>;
}
