import type { Voice } from "@/domain/lyrics/types";
import type { SongStatus } from "@/domain/song/types";

export interface ApprovedLyricsSummary {
  id: string;
  content: string;
  version: number;
}

/**
 * A generated-but-not-yet-approved Lyrics version. Added so the
 * parent-facing UI can restore a version generated in an earlier visit
 * (see `GetLeadSessionStateUseCase`), which the emailed resume link
 * promises ("este mismo enlace te llevará siempre al paso en el que te
 * quedaste" — `WelcomeEmailTemplate`) but could not deliver while the
 * session state only ever carried `approvedLyrics`.
 *
 * Carries three fields an approved version does not, and only those
 * three: they are exactly what `LyricsWorkflow` needs to rebuild the
 * original generation request so "Quiero otra versión" regenerates with
 * the same parameters, as it already does in the uninterrupted flow.
 * `moodName`/`moodDescription` are deliberately absent — they are not
 * persisted, and the client already derives both from `moodId` (see
 * `resolveMood` in `LyricsGenerationForm`). The Claude-authored
 * `prompt`/`musicMood`/`musicDirection` stay server-side: the parent
 * never needs them, so they are never sent.
 *
 * Every field here is the parent's own input, already visible to them —
 * no token, credential, or internal identifier is exposed.
 */
export interface PendingLyricsSummary extends ApprovedLyricsSummary {
  moodId: string;
  /**
   * `null` only for a version created before the Sprint v1.1 migration
   * added the column — see `LyricsProps`. Such a version can still be
   * shown and approved; only regenerating from it is impossible, since
   * the message it was generated from was never stored.
   */
  parentMessage: string | null;
  voice: Voice;
}

export interface CurrentSongSummary {
  id: string;
  status: SongStatus;
  audioUrl: string | null;
  duration: number | null;
}

export interface GetLeadSessionStateResponse {
  babyName: string;
  remainingAttempts: number;
  leadStatus: string;
  approvedLyrics: ApprovedLyricsSummary | null;
  pendingLyrics: PendingLyricsSummary | null;
  song: CurrentSongSummary | null;
}
