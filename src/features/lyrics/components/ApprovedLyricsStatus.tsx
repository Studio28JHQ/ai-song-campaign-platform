import type { LeadSessionSongStatus } from "@/features/lead/services/getLeadSession";
import { LyricsContent } from "./LyricsContent";

interface ApprovedLyricsStatusProps {
  content: string;
  version: number;
  maxAttempts: number;
  songStatus: LeadSessionSongStatus | null;
  supportEmail: string;
}

const SONG_STATUS_LABEL: Record<LeadSessionSongStatus, string> = {
  QUEUED: "Song queued",
  GENERATING: "Song generating",
  COMPLETED: "Song ready",
  FAILED: "Song generation failed",
};

/**
 * The locked, read-only view shown once a Lyrics version has been
 * approved: the approved lyrics become immutable from this point on — no
 * mood selector, no message textarea, no remaining-attempts count, and no
 * "Generate Again" control (see docs/Product/Business_Rules.md — only one
 * approved version may ever exist per lead). Only the current Song status
 * is shown alongside it, using the same status vocabulary the Song Result
 * screen already uses — no parallel state is invented here.
 */
export function ApprovedLyricsStatus({
  content,
  version,
  maxAttempts,
  songStatus,
  supportEmail,
}: ApprovedLyricsStatusProps) {
  const status = songStatus ?? "QUEUED";

  return (
    <div className="flex flex-col gap-4">
      <span className="text-label text-muted-foreground">
        Attempt {version} / {maxAttempts}
      </span>

      <LyricsContent content={content} />

      <p className="text-caption font-medium text-foreground">{SONG_STATUS_LABEL[status]}</p>

      {status === "FAILED" ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          We couldn&apos;t generate your song right now. Please contact support at{" "}
          <a href={`mailto:${supportEmail}`} className="underline">
            {supportEmail}
          </a>{" "}
          for help.
        </p>
      ) : null}
    </div>
  );
}
