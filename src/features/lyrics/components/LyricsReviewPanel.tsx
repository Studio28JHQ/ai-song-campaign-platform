"use client";

import { Button } from "@/components/ui/button";
import { LyricsContent } from "./LyricsContent";

interface LyricsReviewPanelProps {
  content: string;
  version: number;
  maxAttempts: number;
  remainingAttempts: number;
  isGenerating: boolean;
  isApproving: boolean;
  errorMessage?: string | null;
  onApprove: () => void;
  onGenerateAgain: () => void;
}

export function LyricsReviewPanel({
  content,
  version,
  maxAttempts,
  remainingAttempts,
  isGenerating,
  isApproving,
  errorMessage,
  onApprove,
  onGenerateAgain,
}: LyricsReviewPanelProps) {
  const busy = isGenerating || isApproving;
  const noAttemptsLeft = remainingAttempts <= 0;

  return (
    <div className="flex flex-col gap-4">
      {errorMessage ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <span className="text-label text-muted-foreground">
        Attempt {version} / {maxAttempts}
      </span>

      <LyricsContent content={content} />

      <p className="text-caption text-muted-foreground">Remaining attempts: {remainingAttempts}</p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={onApprove} disabled={busy} className="w-full sm:w-auto">
          {isApproving ? "Approving..." : "Approve Lyrics"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onGenerateAgain}
          disabled={busy || noAttemptsLeft}
          className="w-full sm:w-auto"
        >
          {isGenerating ? "Generating..." : "Generate Again"}
        </Button>
      </div>
    </div>
  );
}
