/**
 * Mureka's `gender` field — the narrator voice, as Mureka's own vocabulary
 * expects it. Translated from the domain `Voice` ("MALE"/"FEMALE") only
 * inside this adapter (see `PromptBuilder`); this Mureka-specific value
 * never crosses out of `src/infrastructure/mureka/`.
 */
export type MurekaGender = "male" | "female";

/**
 * The request payload sent to Mureka's official async generation endpoint
 * — exactly the fields in the current official contract. `reference_id`/
 * `vocal_id`/`melody_id` are deliberately not modeled here — out of scope
 * for this version (see CHANGELOG.md — "Future Improvements").
 */
export interface MurekaGenerateRequest {
  lyrics: string;
  prompt: string;
  model: string;
  n: number;
  gender: MurekaGender;
  stream: boolean;
}

/**
 * The structured result this integration produces once Mureka accepts a
 * generation submission — already translated out of Mureka's raw field
 * names (`id`, `trace_id`, `created_at`, `status`); no raw Mureka
 * response shape is ever exposed outside `src/infrastructure/mureka/`.
 */
export interface MurekaSubmissionResult {
  providerTaskId: string;
  providerTraceId: string | null;
  submittedAt: Date;
  providerStatus: string;
}
