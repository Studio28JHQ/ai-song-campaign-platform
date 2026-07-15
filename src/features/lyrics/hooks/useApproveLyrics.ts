"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  approveLyrics,
  ApproveLyricsError,
  type ApproveLyricsInput,
} from "../services/approveLyrics";

export type ApproveLyricsOutcome = { success: true } | { success: false; message: string };

/** Approves a lyrics version and navigates to `/song` on success. */
export function useApproveLyrics() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (input: ApproveLyricsInput): Promise<ApproveLyricsOutcome> => {
      setIsSubmitting(true);

      try {
        await approveLyrics(input);
        router.push("/song");
        return { success: true };
      } catch (error) {
        const message =
          error instanceof ApproveLyricsError
            ? error.message
            : "Algo salió mal. Inténtalo de nuevo.";
        return { success: false, message };
      } finally {
        setIsSubmitting(false);
      }
    },
    [router],
  );

  return { submit, isSubmitting };
}
