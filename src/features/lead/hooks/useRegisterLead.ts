"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  registerLead,
  RegisterLeadError,
  type RegisterLeadErrorCode,
  type RegisterLeadInput,
} from "../services/registerLead";

export type RegisterLeadOutcome =
  { success: true } | { success: false; code: RegisterLeadErrorCode; message: string };

/**
 * Orchestrates a registration submission: tracks the in-flight state and
 * navigates on success. Does not decide *how* to present an error —
 * that's left to the caller. The server identifies the lead via an
 * HttpOnly session cookie it sets on success (see GATE 6.6) — nothing
 * about the lead is stored client-side; `/generate` reconstructs
 * everything it needs from `GET /api/leads/session`.
 */
export function useRegisterLead() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (input: RegisterLeadInput): Promise<RegisterLeadOutcome> => {
      setIsSubmitting(true);

      try {
        await registerLead(input);
        router.push("/generate");
        return { success: true };
      } catch (error) {
        if (error instanceof RegisterLeadError) {
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
    },
    [router],
  );

  return { submit, isSubmitting };
}
