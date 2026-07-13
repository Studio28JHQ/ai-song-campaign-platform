"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  registerLead,
  RegisterLeadError,
  type RegisterLeadErrorCode,
  type RegisterLeadInput,
} from "../services/registerLead";

// Exported so the (separate) Lyrics feature can read the same
// registration data without a new "fetch lead" endpoint — see
// docs/Product/User_Flow.md for the reasoning behind this simplification.
export const LEAD_ID_STORAGE_KEY = "leadId";
export const BABY_NAME_STORAGE_KEY = "babyName";
export const REMAINING_ATTEMPTS_STORAGE_KEY = "remainingAttempts";

export type RegisterLeadOutcome =
  { success: true } | { success: false; code: RegisterLeadErrorCode; message: string };

/**
 * Orchestrates a registration submission: tracks the in-flight state,
 * stores the returned lead id client-side, and navigates on success. Does
 * not decide *how* to present an error — that's left to the caller.
 */
export function useRegisterLead() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (input: RegisterLeadInput): Promise<RegisterLeadOutcome> => {
      setIsSubmitting(true);

      try {
        const result = await registerLead(input);
        window.sessionStorage.setItem(LEAD_ID_STORAGE_KEY, result.leadId);
        window.sessionStorage.setItem(BABY_NAME_STORAGE_KEY, input.babyName);
        window.sessionStorage.setItem(
          REMAINING_ATTEMPTS_STORAGE_KEY,
          String(result.remainingAttempts),
        );
        router.push("/generate");
        return { success: true };
      } catch (error) {
        if (error instanceof RegisterLeadError) {
          return { success: false, code: error.code, message: error.message };
        }

        return {
          success: false,
          code: "internal_error",
          message: "Something went wrong. Please try again.",
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [router],
  );

  return { submit, isSubmitting };
}
