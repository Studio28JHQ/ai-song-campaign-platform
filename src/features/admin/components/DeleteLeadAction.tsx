"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDeleteLead } from "../hooks/useDeleteLead";

interface DeleteLeadActionProps {
  leadId: string;
  parentName: string;
  babyName: string;
  email: string;
  /** Whether this family has a song, from the row already on screen — no extra request. */
  hasSong: boolean;
  onDeleted: () => void;
  onError: (message: string) => void;
}

/**
 * Sprint FINAL-5 — Test Data Cleanup. Deletes one family, permanently.
 *
 * The confirmation names the family, the baby and the email rather than
 * asking "are you sure?", because on a list of two hundred rows the only
 * mistake worth preventing is deleting the wrong one — and this cannot
 * be undone. It also says what goes with it, so the count is a decision
 * input rather than a surprise.
 *
 * The trigger is `destructive` and the confirmation is inline, following
 * `RetrySongAction`: no modal, nothing to dismiss, and the row it
 * belongs to stays visible the whole time.
 */
export function DeleteLeadAction({
  leadId,
  parentName,
  babyName,
  email,
  hasSong,
  onDeleted,
  onError,
}: DeleteLeadActionProps) {
  const { submit, isSubmitting } = useDeleteLead();
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    const outcome = await submit(leadId);
    setConfirming(false);

    if (outcome.success) {
      onDeleted();
    } else {
      onError(outcome.message);
    }
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        Eliminar
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-left">
      <p className="text-sm text-foreground">
        ¿Eliminar a <strong>{parentName}</strong> y el bebé <strong>{babyName}</strong> ({email})?
      </p>
      <p className="text-xs text-muted-foreground">
        Se borrarán también sus letras, sus intentos de generación y{" "}
        {hasSong ? "su canción" : "ninguna canción, porque todavía no tiene"}. Esto no se puede
        deshacer.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isSubmitting}
          onClick={handleConfirm}
        >
          {isSubmitting ? "Eliminando..." : "Confirmar eliminación"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isSubmitting}
          onClick={() => setConfirming(false)}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
