"use client";

import { useCallback, useState } from "react";
import {
  generateLyrics,
  GenerateLyricsError,
  type GenerateLyricsErrorCode,
  type GenerateLyricsInput,
  type GenerateLyricsResult,
} from "../services/generateLyrics";

export type GenerateLyricsOutcome =
  | { success: true; result: GenerateLyricsResult }
  | { success: false; code: GenerateLyricsErrorCode; message: string };

/** Tracks the in-flight state of a lyrics generation (or regeneration) request. */
export function useGenerateLyrics() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(async (input: GenerateLyricsInput): Promise<GenerateLyricsOutcome> => {
    setIsSubmitting(true);

    try {
      const result = await generateLyrics(input);
      return { success: true, result };
    } catch (error) {
      if (error instanceof GenerateLyricsError) {
        return { success: false, code: error.code, message: error.message };
      }

      return {
        success: false,
        code: "internal_error",
        message: "Algo salió mal. Inténtalo de nuevo.",
      };
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { submit, isSubmitting };
}
