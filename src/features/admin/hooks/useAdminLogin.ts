"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { LoginError, type LoginInput, login } from "../services/login";

export type AdminLoginOutcome = { success: true } | { success: false; message: string };

/** Submits admin login credentials and navigates to the dashboard on success. */
export function useAdminLogin() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (input: LoginInput): Promise<AdminLoginOutcome> => {
      setIsSubmitting(true);

      try {
        await login(input);
        router.push("/admin/dashboard");
        return { success: true };
      } catch (error) {
        const message =
          error instanceof LoginError ? error.message : "Algo salió mal. Inténtalo de nuevo.";
        return { success: false, message };
      } finally {
        setIsSubmitting(false);
      }
    },
    [router],
  );

  return { submit, isSubmitting };
}
