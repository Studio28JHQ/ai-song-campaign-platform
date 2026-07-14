"use client";

import { useState } from "react";
import { RetrySongError, retrySong } from "../services/retrySong";

export type RetrySongOutcome = { success: true } | { success: false; message: string };

/** Drives the "Retry" operational recovery action, tracking in-flight state so the triggering button can be disabled to prevent duplicate clicks. */
export function useRetrySong() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(songId: string): Promise<RetrySongOutcome> {
    setIsSubmitting(true);

    try {
      await retrySong(songId);
      return { success: true };
    } catch (error) {
      const message =
        error instanceof RetrySongError ? error.message : "Something went wrong. Please try again.";
      return { success: false, message };
    } finally {
      setIsSubmitting(false);
    }
  }

  return { submit, isSubmitting };
}
