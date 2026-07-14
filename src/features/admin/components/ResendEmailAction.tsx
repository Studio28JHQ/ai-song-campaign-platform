"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResendEmail } from "../hooks/useResendEmail";

interface ResendEmailActionProps {
  songId: string;
  onSuccess: () => void;
}

/**
 * The "Resend email" operational recovery action (see
 * docs/Product/User_Flow.md — Operational Recovery). Only ever rendered
 * by the caller when the song is completed and the automatic email has
 * already gone out. Requires a reason and an explicit confirmation step;
 * the buttons are disabled for the whole in-flight duration to prevent a
 * duplicate click from sending a second copy.
 */
export function ResendEmailAction({ songId, onSuccess }: ResendEmailActionProps) {
  const { submit, isSubmitting } = useResendEmail();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [notification, setNotification] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleConfirm() {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setNotification({ ok: false, message: "Please provide a reason for the resend." });
      return;
    }

    setNotification(null);
    const outcome = await submit(songId, trimmedReason);

    if (outcome.success) {
      setConfirming(false);
      setReason("");
      setNotification({ ok: true, message: "Email resent successfully." });
      onSuccess();
    } else {
      setNotification({ ok: false, message: outcome.message });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Label htmlFor="resend-email-reason">Reason for resending</Label>
          <Input
            id="resend-email-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Parent said they never received it."
            disabled={isSubmitting}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={isSubmitting} onClick={handleConfirm}>
              {isSubmitting ? "Sending..." : "Confirm Resend"}
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
          Resend Email
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
