/**
 * Boundary-facing input for `GenerateSongUseCase`. Only `leadId` is
 * needed — the lead's approved Lyrics (and, through it, the selected
 * Mood) are looked up server-side, never supplied by the caller.
 */
export interface GenerateSongRequest {
  leadId: string;
}
