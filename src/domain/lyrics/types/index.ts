/** Input to `Lyrics.create`. The generated text (`content`) is produced elsewhere (a future Claude integration) and passed in already generated — this module only manages lyrics versions, it does not generate them. */
export interface CreateLyricsInput {
  leadId: string;
  moodId: string;
  prompt: string;
  content: string;
  version: number;
}

/** Internal entity state. Not exported for external mutation — see `Lyrics`. */
export interface LyricsProps {
  id: string;
  leadId: string;
  moodId: string;
  prompt: string;
  content: string;
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
  approved: boolean;
  rejectionReason: string | null;
  version: number;
  createdAt: Date;
}
