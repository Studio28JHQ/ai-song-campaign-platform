"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  registerLead,
  RegisterLeadError,
  type RegisterLeadErrorCode,
  type RegisterLeadInput,
} from "../services/registerLead";

const LEAD_ID_STORAGE_KEY = "leadId";

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
