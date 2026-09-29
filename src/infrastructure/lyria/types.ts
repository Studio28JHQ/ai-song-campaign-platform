/**
 * The Lyria model this campaign generates with, pinned exactly like
 * Mureka's (`mureka/PromptBuilder`) rather than left to a moving alias —
 * so every song is attributable to a known model, and `Song.providerModel`
 * records which one.
 *
 * Verified live against the Gemini Developer API before this adapter was
 * written: the key lists `models/lyria-3.5`, and
 * `client.interactions.create({ model: "lyria-3.5", ... })` returns
 * `output_audio` with `mime_type: "audio/mpeg"`.
 */
export const LYRIA_MODEL = "lyria-3.5";

/**
 * The shape this adapter needs out of the SDK's `Interaction` response.
 * Structural, not imported from `@google/genai`: the SDK types every field
 * as optional (its `Interaction` covers agents, streaming and text
 * interactions too), so validating what we actually require — audio bytes
 * and an id — is `ResponseParser`'s job, and stating the shape here keeps
 * the vendor type out of the rest of the codebase.
 */
export interface LyriaInteractionAudio {
  data?: string;
  mime_type?: string;
}

export interface LyriaInteractionResponse {
  id?: string;
  model?: string;
  status?: string;
  output_audio?: LyriaInteractionAudio;
}
