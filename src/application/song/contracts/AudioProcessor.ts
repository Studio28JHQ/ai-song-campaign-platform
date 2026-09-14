export interface ProcessedAudio {
  bytes: Uint8Array;
  /** The final audio's actual duration, in whole seconds — measured from the real output, never trusted from a provider's self-reported value. */
  durationSeconds: number;
}

/**
 * What `GenerationPoller` needs to turn a provider's raw generated audio
 * into the campaign's final, deliverable artifact — nothing more.
 * Implemented by `FfmpegAudioProcessor` (`src/infrastructure/audio/`).
 * Enforces the campaign's duration rule (see its own doc comment): a
 * source shorter than 60 seconds is preserved untouched; a source at or
 * beyond 60 seconds is faded out (~55s-60s) and hard-capped at 60s. This
 * port exists so the poller depends only on an application-layer
 * contract, never a concrete ffmpeg/child_process detail, and can be
 * constructed with a fake in tests.
 */
export interface AudioProcessor {
  process(input: Uint8Array): Promise<ProcessedAudio>;
}
