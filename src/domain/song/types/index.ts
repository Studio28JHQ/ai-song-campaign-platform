/**
 * Coarse lifecycle for the Song aggregate itself. Deliberately omits the
 * persistence-layer's `DELIVERED` value (see `prisma/schema.prisma`) —
 * that state belongs to a future email-delivery module, which isn't
 * implemented yet (see PROJECT_MANIFEST.md scope for this task).
 */
export enum SongStatus {
  PENDING = "PENDING",
  GENERATING = "GENERATING",
  READY = "READY",
  FAILED = "FAILED",
}

/** Input to `Song.create`. Raw primitives, referencing an already-approved Lyrics version. */
export interface CreateSongInput {
  leadId: string;
  lyricsId: string;
  moodId: string;
}

/** Details Suno returns once generation succeeds. */
export interface SongGenerationDetails {
  providerSongId: string;
  audioUrl: string;
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
  audioUrl: string | null;
  duration: number | null;
  status: SongStatus;
  generatedAt: Date | null;
  /** When the one-time "song ready" email was delivered — `null` until then. Written exclusively by `EmailDeliveryTracker`'s atomic claim (see `docs/Architecture/External_Services.md`); read-only from this entity's perspective. */
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
  audioUrl: string | null;
  duration: number | null;
  status: SongStatus;
  generatedAt: Date | null;
  emailedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
