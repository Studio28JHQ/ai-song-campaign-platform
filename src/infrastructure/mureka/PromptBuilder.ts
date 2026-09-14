import type { SongGenerationInput } from "@/application/song/contracts/SongGenerationProvider";
import type { Voice } from "@/domain/lyrics/types";
import type { MurekaGender, MurekaGenerateRequest } from "./types";

/**
 * Mureka's official docs show `"model": "auto"` in their quickstart
 * example — letting Mureka pick the current generation model rather
 * than pinning a specific version, the same "don't hardcode a moving
 * target" reasoning `ClaudeClient` applies to its own model constant.
 * Reference: https://platform.mureka.ai/docs/en/quickstart.html
 */
const MUREKA_MODEL = "auto";

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
 * exactly 60 seconds, or that vocals enter at exactly second 5 — both
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
 * "Lead vocals enter by about second 5" — allows only a brief musical
 * pickup, never a long intro. "Two compact narrative verses, one
 * memorable chorus, a genuine emotional ending" mirrors the
 * two-`[Verse]` structure `ai/claude/PromptBuilder` requires, so
 * Mureka's own sense of the song's shape matches the lyrics it
 * receives.
 */
const MUREKA_STYLE =
  "Commercial social media baby-care jingle — two compact narrative verses, one memorable chorus, a genuine emotional ending — up to about 60 seconds, shorter is fine, never padded, warm Latin Spanish voice, neutral pronunciation, lead vocals enter by about second 5, only a brief musical pickup, no long instrumental intro, upbeat children's acoustic folk-pop, 86 BPM, acoustic guitar, ukulele, marimba, glockenspiel, soft percussion, subtle children's choir only during the ending, compact commercial arrangement, lyrics addressed to the baby, naming the baby naturally, bright, playful, memorable melody, \"Pequeñas grandes historias\" as an emotional concept only, sing the lyrics exactly once, continuously and naturally, using the vocal time for the story, no repeated chorus, no repeated verses, no instrumental padding, no filler vocalizations (humming, mmm, uh, ooh), finish naturally, leaving only a short musical ending.";

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
