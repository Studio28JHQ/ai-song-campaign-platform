import type { SongGenerationInput } from "@/application/song/contracts/SongGenerationProvider";
import type { Voice } from "@/domain/lyrics/types";
import type { MurekaGender, MurekaGenerateRequest } from "./types";

/**
 * Pinned to an explicit Mureka model version, replacing the previous
 * `"auto"`. Mureka documents `auto` as "select the latest version of
 * the regular model", which means the model behind every submission
 * could change without any change here — and with it the generated
 * song's length, arrangement, and adherence to `MUREKA_STYLE` mid
 * campaign. `mureka-9` is one of the values Mureka's own request schema
 * lists for this field (`auto`, `mureka-7.6`, `mureka-o2`, `mureka-8`,
 * `mureka-9`, `mureka-9.5`), so every song this campaign generates is
 * produced by the same, known model.
 * Reference: https://platform.mureka.ai/docs/api/operations/post-v1-song-generate.html
 */
export const MUREKA_MODEL = "mureka-9";

/** Exactly one song is ever generated per call (see docs/Product/Business_Rules.md — Song Rules). */
const MUREKA_SONG_COUNT = 1;

/**
 * Validated Mureka STYLE — confirmed against the real Mureka API by an
 * external test script (see CHANGELOG.md). Fixed and identical for
 * every submission: it describes the commercial jingle's arrangement,
 * tempo, instrumentation, and pacing, none of which vary per lead —
 * only the lyrics (still Claude-generated, user-approved, and passed
 * through separately as `MurekaGenerateRequest.lyrics`) vary per lead.
 * Comfortably under Mureka's undocumented 1024-character `prompt` limit
 * (~926 characters). This does not guarantee Mureka's output lands at
 * exactly 60 seconds, or that vocals enter at exactly second 2 — both
 * are musical *targets* given to the generation model, never a
 * deterministic timestamp guarantee — see `FfmpegAudioProcessor` for
 * the one actually deterministic mechanism, the 60-second cap.
 *
 * Deliberately says "warm Latin Spanish voice" — not "warm *male* Latin
 * Spanish voice" — because `gender` below is dynamic (the lead's own
 * Voice selection), and a fixed "male" in the STYLE text would
 * contradict a FEMALE request. BPM is 86 for this validated production
 * configuration.
 *
 * Does not name a brand phrase to pronounce — the production brand
 * phrase is "Sensyderm Baby", and where/how it's sung is governed by
 * the lyrics themselves (see `ai/claude/PromptBuilder`'s Brand
 * Placement rules), not by a STYLE-level pronunciation cue.
 * "Pequeñas grandes historias" is named only as an emotional concept,
 * not as text to sing.
 *
 * "Up to about 60 seconds, shorter is fine, never padded" — 60s is
 * explicitly a ceiling, never a target: Mureka must never pad an
 * already-complete performance with extra instrumental or vocalized
 * time just to approach it — a short, thin lyric combined with an
 * "approximately 60 seconds" wording risks Mureka filling the
 * remaining time with instrumental padding or meaningless
 * vocalizations ("mmm", "uh", "ooh", humming) instead of an actual
 * story — explicitly forbidden.
 *
 * **The three temporal anchors, restored.** An audit on 2026-09-30
 * compared this text against the external script that first validated
 * the jingle format and found that this constant — written from memory
 * when the Mureka path was restored — had quietly dropped the two
 * instructions that gave the vocal a time budget, and had softened a
 * third:
 *
 * - *"vocals begin within the first two seconds with an immediate vocal
 *   hook, no instrumental intro"* replaces "lead vocals enter by about
 *   second 5, only a brief musical pickup, no **long** instrumental
 *   intro". The softened wording licensed exactly what it was meant to
 *   forbid: "only a brief musical pickup" permits an intro, and "no
 *   *long* intro" makes the prohibition a matter of degree. The ban is
 *   absolute again.
 * - *"finish the vocal performance naturally around second 50, leaving
 *   only a short instrumental ending"* replaces a bare "finish
 *   naturally", which set no deadline for the singing at all. This is
 *   the anchor that matters most, and it pairs with
 *   `FfmpegAudioProcessor`'s fade, which starts at second 55: a vocal
 *   that ends near 50 leaves the fade window carrying instrument only,
 *   instead of fading out the last words.
 * - *"sing every line of the lyrics including the final line before the
 *   instrumental ending begins"* is new — neither version had it. The
 *   campaign's brand line is the last thing in every lyric
 *   (`ai/claude/PromptBuilder`'s Brand Placement puts "Sensyderm Baby"
 *   in `[Ending]`, and it lands in the final 90 characters of 529 of
 *   534 approved lyrics), so a performance that runs out of time loses
 *   the brand first.
 *
 * Measured before the change: 257 of 267 `mureka-9` songs (96.3%)
 * reached `FfmpegAudioProcessor` at 60 seconds or longer and had to be
 * cut, meaning the performance was still going when the cap arrived.
 *
 * "Two compact narrative verses, one memorable chorus, a genuine
 * emotional ending" is deliberately left alone in this iteration: it
 * mirrors the two-`[Verse]` structure `ai/claude/PromptBuilder`
 * requires, and whether it also costs musical time is a hypothesis the
 * audit could not demonstrate. 86 BPM and `mureka-9` are unchanged for
 * the same reason — one variable at a time.
 */
export const MUREKA_STYLE =
  "Commercial social media baby-care jingle — two compact narrative verses, one memorable chorus, a genuine emotional ending — up to about 60 seconds, shorter is fine, never padded, warm Latin Spanish voice, neutral pronunciation, vocals begin within the first two seconds with an immediate vocal hook, no instrumental intro, upbeat children's acoustic folk-pop, 86 BPM, acoustic guitar, ukulele, marimba, glockenspiel, soft percussion, subtle children's choir only during the ending, compact commercial arrangement, lyrics addressed to the baby, naming the baby naturally, bright, playful, memorable melody, \"Pequeñas grandes historias\" as an emotional concept only, sing every line of the lyrics exactly once, continuously and naturally, including the final line before the instrumental ending begins, no repeated chorus, no repeated verses, no instrumental padding, no filler vocalizations (humming, mmm, uh, ooh), finish the vocal performance naturally around second 50, leaving only a short instrumental ending.";

/** This pipeline never streams playback — Mureka generates the full song asynchronously, polled to completion (see `GenerationPoller`). */
const MUREKA_STREAM = false;

/**
 * Translates the domain `Voice` ("MALE"/"FEMALE") into Mureka's own
 * `gender` field — the only place this translation happens; the
 * Mureka-specific lowercase values never cross out of this adapter.
 */
const GENDER_MAP: Record<Voice, MurekaGender> = {
  FEMALE: "female",
  MALE: "male",
};

/**
 * Builds the request payload sent to Mureka from `GenerationDispatcher`'s
 * `SongGenerationInput`. `prompt` is the fixed, validated `MUREKA_STYLE`
 * (see its own doc comment) — not composed from the approved Lyrics
 * version's own `musicMood`/`musicDirection`, which Claude still
 * generates and which the admin panel still displays, but which no
 * longer flow into the Mureka request itself. `lyrics` is passed
 * through exactly as approved, never regenerated or otherwise altered,
 * as its own top-level field — Mureka's actual structural field for the
 * song text, and the one part of every request that still varies per
 * lead.
 *
 * `prompt` deliberately does NOT also embed `lyrics` — live-verified
 * against the real Mureka API: `prompt` has an undocumented (not shown
 * in Mureka's own quickstart/reference examples) hard limit of 1024
 * characters, and an earlier production submission's `prompt` exceeded
 * it by duplicating the full song lyrics inside it on top of the
 * dedicated `lyrics` field, which Mureka rejected with `HTTP 400` /
 * "The prompt exceeds 1024 characters." The narrator voice is not
 * described in `prompt` either, since Mureka's official contract has a
 * dedicated `gender` field for it — describing it in both places would
 * be redundant.
 *
 * Sprint v1.2 — AI Safety Hardening: the parent's raw message never
 * reaches this class — `SongGenerationInput` has no `parentMessage`
 * field at all (see its own doc comment). Mureka receives only the
 * fixed STYLE, Claude's already-moderated lyrics, and the selected
 * `voice` (as `gender`); it is never responsible for moderation itself.
 */
export class PromptBuilder {
  static build(input: SongGenerationInput): MurekaGenerateRequest {
    return {
      lyrics: input.lyrics,
      prompt: MUREKA_STYLE,
      model: MUREKA_MODEL,
      n: MUREKA_SONG_COUNT,
      gender: GENDER_MAP[input.voice],
      stream: MUREKA_STREAM,
    };
  }
}
