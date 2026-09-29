import type { SongGenerationInput } from "@/application/song/contracts/SongGenerationProvider";
import { MUREKA_STYLE } from "@/infrastructure/mureka/PromptBuilder";
import type { Voice } from "@/domain/lyrics/types";

/**
 * The vocal gender, stated in words. Lyria's Interactions API has no
 * dedicated `gender` field the way Mureka does — the whole request is one
 * text prompt — so the lead's own `Voice` selection has to be expressed in
 * that text. This is the only place that translation happens, the same
 * containment rule `mureka/PromptBuilder`'s `GENDER_MAP` follows.
 */
const VOICE_DESCRIPTION: Record<Voice, string> = {
  FEMALE: "female lead vocal",
  MALE: "male lead vocal",
};

/**
 * Builds Lyria's single text prompt.
 *
 * For this first A/B phase the creative content is deliberately **identical
 * to Mureka's**: the same validated `MUREKA_STYLE` (imported, never copied —
 * a second copy of those 926 characters would drift the moment either was
 * edited) and the same approved lyrics, passed through byte for byte. No
 * translation, no Lyria-specific rewrite, no second creative version. That
 * is the whole point of the comparison: the only variable is the provider.
 *
 * Two structural differences from the Mureka request, both forced by
 * Lyria's contract rather than chosen:
 *
 * - **Style and lyrics share one field.** Mureka has separate `prompt` and
 *   `lyrics` fields; Lyria takes a single `input` string, so the two are
 *   concatenated with a labelled separator that keeps the lyric block
 *   unambiguous.
 * - **The voice is described in prose.** See `VOICE_DESCRIPTION`.
 *
 * The lyrics themselves are untouched: same words, same punctuation, same
 * baby name, same brand mention, same `[Verse]/[Verse]/[Chorus]/[Ending]`
 * section tags as stored and approved. Google documents `[Verse]`,
 * `[Chorus]` and `[Bridge]` as recognised section tags; `[Ending]` is not in
 * that list, and it is deliberately left exactly as approved rather than
 * remapped — rewriting an approved lyric to suit a provider is not
 * something this layer is allowed to do, and an unrecognised tag is a
 * formatting hint at worst.
 */
export class PromptBuilder {
  static build(input: SongGenerationInput): string {
    return [
      MUREKA_STYLE,
      `Vocal: ${VOICE_DESCRIPTION[input.voice]}.`,
      "Lyrics to sing, exactly as written:",
      input.lyrics,
    ].join("\n\n");
  }
}
