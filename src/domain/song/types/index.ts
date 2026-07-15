/**
 * Coarse lifecycle for the Song aggregate itself — the only valid
 * generation states (see PROJECT_MANIFEST.md — Architecture exception,
 * Sprint 7.5). Deliberately omits the persistence-layer's `DELIVERED`
 * value (see `prisma/schema.prisma`) — that state belongs to a future
 * email-delivery module, which isn't implemented yet.
 */
export enum SongStatus {
  QUEUED = "QUEUED",
  GENERATING = "GENERATING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

/** Input to `Song.create`. Raw primitives, referencing an already-approved Lyrics version. */
export interface CreateSongInput {
  leadId: string;
  lyricsId: string;
  moodId: string;
}

/**
 * What `GenerationDispatcher` records once the provider accepts a
 * generation job (Sprint 9.1) — before the job has actually finished.
 * `providerTraceId` is optional since not every provider returns one.
 */
export interface SongSubmissionDetails {
  providerTaskId: string;
  providerTraceId?: string | null;
}

/**
 * Details `GenerationPoller` persists once generation succeeds.
 * `audioStorageKey` is a Cloudflare R2 object key — never a signed URL,
 * never a provider URL (see `AudioUrlResolver`, resolved fresh at read
 * time instead of persisted).
 */
export interface SongGenerationDetails {
  providerSongId: string;
  audioStorageKey: string;
  duration?: number | null;
}

/** Internal entity state. Not exported for external mutation — see `Song`. */
export interface SongProps {
  id: string;
  leadId: string;
  lyricsId: string;
  moodId: string;
  provider: string;
  providerSongId: string | null;
  providerTaskId: string | null;
  providerTraceId: string | null;
  /** The provider's own last-reported state ("submitted", "completed", "failed", ...) — diagnostics only, never used for domain transitions. */
  providerStatus: string | null;
  providerError: string | null;
  audioStorageKey: string | null;
  duration: number | null;
  status: SongStatus;
  /** When `GenerationDispatcher` submitted this job to the provider. */
  submittedAt: Date | null;
  /** When generation succeeded — `null` until then. */
  generatedAt: Date | null;
  /** When `GenerationPoller` reached a terminal outcome, success or failure. */
  completedAt: Date | null;
  /** When the one-time "song ready" email was delivered — `null` until then. Written exclusively by `EmailDeliveryTracker`'s atomic claim; read-only from this entity's perspective. */
  emailedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Plain, read-only view of a Song for callers that need primitives. */
export interface SongSnapshot {
  id: string;
  leadId: string;
  lyricsId: string;
  moodId: string;
  provider: string;
  providerSongId: string | null;
  providerTaskId: string | null;
  providerTraceId: string | null;
  providerStatus: string | null;
  providerError: string | null;
  audioStorageKey: string | null;
  duration: number | null;
  status: SongStatus;
  submittedAt: Date | null;
  generatedAt: Date | null;
  completedAt: Date | null;
  emailedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
