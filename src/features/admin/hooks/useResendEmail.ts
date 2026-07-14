"use client";

import { useState } from "react";
import { ResendSongEmailError, resendSongEmail } from "../services/resendSongEmail";

export type ResendEmailOutcome = { success: true } | { success: false; message: string };

/** Drives the "Resend email" operational recovery action, tracking in-flight state so the triggering button can be disabled to prevent duplicate clicks. */
export function useResendEmail() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(songId: string, reason: string): Promise<ResendEmailOutcome> {
    setIsSubmitting(true);

    try {
      await resendSongEmail(songId, reason);
      return { success: true };
    } catch (error) {
      const message =
        error instanceof ResendSongEmailError
          ? error.message
          : "Something went wrong. Please try again.";
      return { success: false, message };
    } finally {
      setIsSubmitting(false);
    }
  }

  return { submit, isSubmitting };
}
