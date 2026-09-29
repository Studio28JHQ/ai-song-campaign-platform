"use client";

import { useState } from "react";
import { DeleteLeadError, deleteLead } from "../services/deleteLead";

export type DeleteLeadOutcome = { success: true } | { success: false; message: string };

/**
 * Drives the "Eliminar" action, tracking in-flight state so the button
 * can be disabled — which matters more here than elsewhere: a second
 * click on an irreversible operation has nothing left to delete.
 */
export function useDeleteLead() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(leadId: string): Promise<DeleteLeadOutcome> {
    setIsSubmitting(true);

    try {
      await deleteLead(leadId);
      return { success: true };
    } catch (error) {
      const message =
        error instanceof DeleteLeadError ? error.message : "Algo salió mal. Inténtalo de nuevo.";
      return { success: false, message };
    } finally {
      setIsSubmitting(false);
    }
  }

  return { submit, isSubmitting };
}
