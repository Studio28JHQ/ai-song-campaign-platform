/**
 * Sprint v1.1 — AI Musical Direction. The parent's requested narrator
 * voice, selected on the lyrics generation form alongside the tone and
 * song description. Carried on `Lyrics` (one per generation attempt,
 * same lifecycle as `musicMood`/`musicDirection`) and used only when
 * building the Mureka prompt (see `mureka/PromptBuilder`) — never sent
 * to Claude, never affects lyrics generation. A plain string-literal
 * union (matching Prisma's own generated enum shape), not a TS `enum`,
 * so it is directly assignable at every boundary (Zod, Prisma) without
 * a translation map.
 */
export const VOICE_OPTIONS = ["FEMALE", "MALE"] as const;
export type Voice = (typeof VOICE_OPTIONS)[number];

/** Input to `Lyrics.create`. The generated text (`content`) is produced elsewhere (a future Claude integration) and passed in already generated — this module only manages lyrics versions, it does not generate them. */
export interface CreateLyricsInput {
  leadId: string;
  moodId: string;
  prompt: string;
  content: string;
  version: number;
  /**
   * Sprint v1.1 — AI Musical Direction. The parent's song description
   * ("Baby Context"), and Claude's own creative musical interpretation,
   * generated in the same call as `content` — see `PromptBuilder`/
   * `ResponseParser` (Claude). Always provided together with `content`;
   * `GenerateLyricsForLeadUseCase` never creates a Lyrics row otherwise.
   */
  parentMessage: string;
  musicMood: string;
  musicDirection: string;
  voice: Voice;
}

/** Internal entity state. Not exported for external mutation — see `Lyrics`. */
export interface LyricsProps {
  id: string;
  leadId: string;
  moodId: string;
  prompt: string;
  content: string;
  /** `null` only for a Lyrics row created before Sprint v1.1 — see `CreateLyricsInput`. */
  parentMessage: string | null;
  musicMood: string | null;
  musicDirection: string | null;
  voice: Voice;
  approved: boolean;
  rejectionReason: string | null;
  version: number;
  createdAt: Date;
}

/** Plain, read-only view of a Lyrics version for callers that need primitives. */
export interface LyricsSnapshot {
  id: string;
  leadId: string;
  moodId: string;
  prompt: string;
  content: string;
  parentMessage: string | null;
  musicMood: string | null;
  musicDirection: string | null;
  voice: Voice;
  approved: boolean;
  rejectionReason: string | null;
  version: number;
  createdAt: Date;
}
