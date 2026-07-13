"use client";

import { Button } from "@/components/ui/button";

interface LyricsReviewPanelProps {
  content: string;
  version: number;
  remainingAttempts: number;
  isGenerating: boolean;
  isApproving: boolean;
  errorMessage?: string | null;
  onApprove: () => void;
  onGenerateAgain: () => void;
}

function extractTitle(content: string): string {
  const [firstLine] = content.split("\n");
  return firstLine?.trim() || "Your song";
}

export function LyricsReviewPanel({
  content,
  version,
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

      <div className="flex flex-col gap-1">
        <span className="text-label text-muted-foreground">Version {version}</span>
        <h2 className="text-title font-semibold text-foreground">{extractTitle(content)}</h2>
      </div>

      <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-body text-foreground">
        {content}
      </pre>

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
