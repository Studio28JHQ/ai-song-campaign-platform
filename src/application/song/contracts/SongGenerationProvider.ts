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
import type { Voice } from "@/domain/lyrics/types";

/**
 * Sprint v1.1 — AI Musical Direction: replaces the fixed `moodName`/
 * `sunoPrompt` pair with the approved Lyrics version's own AI-generated
 * musical direction — see `Lyrics.musicMood`/`musicDirection`/`voice`,
 * sourced by `GenerationDispatcher` and shaped into Mureka's prompt by
 * `mureka/PromptBuilder`. `Mood.sunoPrompt` itself is unchanged and
 * still exists, just no longer read for this.
 *
 * Sprint v1.2 — AI Safety Hardening: deliberately has no `parentMessage`
 * field. The parent's raw message must never reach Mureka — only
 * Claude's own moderated, transformed creative output (`musicMood`,
 * `musicDirection`, `lyrics`) and the fixed `voice` selection do. See
 * `mureka/PromptBuilder` and `GenerationDispatcher`.
 */
export interface SongGenerationInput {
  lyrics: string;
  musicMood: string;
  musicDirection: string;
  voice: Voice;
}

/**
 * The providers this campaign can generate with. A closed set on the
 * write path (the Admin panel's routing form validates against it — see
 * `UpdateGenerationRoutingUseCase`); the read path stays permissive so a
 * value that predates this union, or one somebody wrote straight into the
 * database, degrades into a controlled "unknown provider" error instead
 * of a type-level lie (see `SongGenerationProviderRegistry`).
 */
export const SONG_GENERATION_PROVIDERS = ["mureka", "lyria"] as const;

export type SongGenerationProviderName = (typeof SONG_GENERATION_PROVIDERS)[number];

/** Raw audio bytes as a provider handed them over, before any post-processing. */
export interface GeneratedAudio {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * What a provider returns from `submitGeneration`. Two shapes, because the
 * two providers genuinely differ and forcing either into the other's mould
 * would mean inventing state that does not exist:
 *
 * - `async` — the provider accepted a job and handed back a task id to
 *   poll later (Mureka). Nothing has been generated yet.
 * - `immediate` — the provider generated the song inside this very call
 *   and returned the audio with it (Lyria's Interactions API). There is no
 *   task id, because there is no task to poll.
 *
 * Both paths converge immediately afterwards: `immediate` audio goes
 * through the exact same `SongCompletionService` (FFmpeg → R2 → DB →
 * email) that `async` audio reaches after `GenerationPoller` downloads
 * it. There is one audio pipeline, not two.
 */
export type SongGenerationSubmission =
  | { kind: "async"; providerTaskId: string; providerTraceId: string | null }
  | { kind: "immediate"; providerSongId: string; audio: GeneratedAudio };

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
  /** Persisted on `Song.provider`, and the key this provider is registered under. */
  readonly name: SongGenerationProviderName;
  /** Persisted on `Song.providerModel` — the provider's own model identifier. */
  readonly model: string;
  submitGeneration(input: SongGenerationInput): Promise<SongGenerationSubmission>;
  /**
   * Only an asynchronous provider implements this: a provider whose
   * `submitGeneration` returns `immediate` has already finished by the time
   * it returns, so there is never a task for `GenerationPoller` to ask
   * about. Absent rather than a stub that throws, so the distinction is
   * visible in the type system instead of at runtime.
   */
  pollGenerationStatus?(providerTaskId: string): Promise<SongGenerationPollResult>;
}
