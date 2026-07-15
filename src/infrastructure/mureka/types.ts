/** The request payload sent to Mureka's official async generation endpoint. */
export interface MurekaGenerateRequest {
  lyrics: string;
  model: string;
  prompt: string;
  n: number;
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
