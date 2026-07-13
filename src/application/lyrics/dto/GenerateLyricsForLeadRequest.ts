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
}
