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
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <span className="text-label text-muted-foreground">
        Intento {version} / {maxAttempts}
      </span>

      <LyricsContent content={content} />

      <p className="text-caption text-muted-foreground">Intentos restantes: {remainingAttempts}</p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/85 sm:w-auto"
        >
          {isApproving ? "Creando canción..." : "¡Me encanta! Crear canción"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onGenerateAgain}
          disabled={busy || noAttemptsLeft}
          className="w-full rounded-full sm:w-auto"
        >
          {isGenerating ? "Creando..." : "Quiero otra versión"}
        </Button>
      </div>
    </div>
  );
}
