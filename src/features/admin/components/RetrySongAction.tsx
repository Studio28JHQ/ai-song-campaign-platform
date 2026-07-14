"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRetrySong } from "../hooks/useRetrySong";

interface RetrySongActionProps {
  songId: string;
  onSuccess: () => void;
}

/**
 * The "Retry" operational recovery action (see docs/Product/User_Flow.md
 * — Operational Recovery). Only ever rendered by the caller when the
 * song's status is `FAILED`. Requires an explicit confirmation step, and
 * the trigger/confirm buttons are disabled for the whole in-flight
 * duration to prevent a duplicate click from starting a second retry.
 */
export function RetrySongAction({ songId, onSuccess }: RetrySongActionProps) {
  const { submit, isSubmitting } = useRetrySong();
  const [confirming, setConfirming] = useState(false);
  const [notification, setNotification] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleConfirm() {
    setNotification(null);
    const outcome = await submit(songId);
    setConfirming(false);

    if (outcome.success) {
      setNotification({
        ok: true,
        message: "Retry started — the song will regenerate in the background.",
      });
      onSuccess();
    } else {
      setNotification({ ok: false, message: outcome.message });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-sm text-foreground">
            Retry generating this song? The approved lyrics and mood will be reused as-is — this
            will not consume another attempt.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={isSubmitting} onClick={handleConfirm}>
              {isSubmitting ? "Retrying..." : "Confirm Retry"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Retry Generation
        </Button>
      )}

      {notification ? (
        <p
          role={notification.ok ? "status" : "alert"}
          className={notification.ok ? "text-sm text-foreground" : "text-sm text-destructive"}
        >
          {notification.message}
        </p>
      ) : null}
    </div>
  );
}
