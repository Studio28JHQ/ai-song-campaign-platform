"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { useSongResult } from "../hooks/useSongResult";

interface SongResultViewProps {
  supportEmail: string;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * The Song Result page's full experience: kicks off + polls generation via
 * `useSongResult`, then renders the loading, completed, or failed view.
 * The user can only ever generate one final song (see
 * docs/Product/Business_Rules.md), so "Generate Another Song" is always
 * shown disabled rather than omitted.
 */
export function SongResultView({ supportEmail }: SongResultViewProps) {
  const { babyName, status, audioUrl, duration } = useSongResult();
  const title = babyName ? `${babyName}'s Song` : "Your Song";

  if (status === "FAILED") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-heading font-bold text-foreground">{title}</h1>
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          We couldn&apos;t generate your song right now. Please contact support at{" "}
          <a href={`mailto:${supportEmail}`} className="underline">
            {supportEmail}
          </a>{" "}
          for help.
        </p>
        <Button type="button" disabled className="w-full sm:w-auto">
          Generate Another Song
        </Button>
      </div>
    );
  }

  if (status === "COMPLETED") {
    const formattedDuration = formatDuration(duration);

    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-heading font-bold text-foreground">{title}</h1>
        <p className="text-body text-muted-foreground">Your personalized song is ready!</p>

        {audioUrl ? (
          <audio controls src={audioUrl} className="w-full max-w-sm">
            Your browser does not support the audio element.
          </audio>
        ) : null}

        {formattedDuration ? (
          <p className="text-caption text-muted-foreground">Duration: {formattedDuration}</p>
        ) : null}

        {audioUrl ? (
          <a href={audioUrl} download className={buttonVariants({ variant: "default" })}>
            Download Song
          </a>
        ) : null}

        <p className="text-caption text-muted-foreground">
          Share the joy — let friends and family know about {title}!
        </p>

        <Button type="button" disabled className="w-full sm:w-auto">
          Generate Another Song
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-heading font-bold text-foreground">{title}</h1>
      <div
        role="status"
        aria-label="Generating your song"
        className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary"
      />
      <p className="text-body text-muted-foreground">
        We&apos;re generating your personalized song. This usually takes a few minutes — feel free
        to keep this page open, it will update automatically.
      </p>
      <Button type="button" disabled className="w-full sm:w-auto">
        Generate Another Song
      </Button>
    </div>
  );
}
