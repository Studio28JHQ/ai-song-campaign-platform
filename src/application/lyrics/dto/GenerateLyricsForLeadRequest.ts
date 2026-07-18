import type { Voice } from "@/domain/lyrics/types";

/**
 * Boundary-facing input for `GenerateLyricsForLeadUseCase`. Unlike
 * `GenerateLyricsRequest`, this does not carry already-generated content —
 * this use case calls the `LyricsGenerator` port itself, as part of
 * orchestrating the full "generate lyrics for a lead" flow.
 */
export interface GenerateLyricsForLeadRequest {
  leadId: string;
  moodId: string;
  moodName: string;
  moodDescription?: string;
  parentMessage: string;
  /**
   * Sprint v1.1 — AI Musical Direction. The parent's requested narrator
   * voice — persisted alongside the resulting Lyrics version when
   * approved, but never passed to `LyricsGenerator` (Claude never sees
   * it; see `PromptBuilder` — Mureka).
   */
  voice: Voice;
}
