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
        <p
          role="alert"
          className="rounded-lg border-l-4 border-destructive bg-[var(--destructive-background)] px-3 py-2 text-sm text-foreground"
        >
          {errorMessage}
        </p>
      ) : null}

      <span className="text-center text-label text-muted-foreground">
        Intento {version} / {maxAttempts}
      </span>

      <LyricsContent content={content} />

      <p className="text-center text-caption text-muted-foreground">
        Intentos restantes: {Math.max(0, remainingAttempts - 1)}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="h-12 w-full rounded-full px-8 text-base font-semibold shadow-md shadow-primary/25 hover:bg-[var(--primary-hover)] sm:w-auto"
        >
          {isApproving ? "Creando canción..." : "¡Me encanta! Crear canción"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onGenerateAgain}
          disabled={busy || noAttemptsLeft}
          className="h-12 w-full rounded-full border-2 border-primary bg-card px-8 text-base font-semibold text-primary hover:bg-secondary sm:w-auto"
        >
          {isGenerating ? "Creando..." : "Quiero otra versión"}
        </Button>
      </div>
    </div>
  );
}
