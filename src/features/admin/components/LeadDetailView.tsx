"use client";

import { buttonVariants } from "@/components/ui/button";
import { useLeadDetail } from "../hooks/useLeadDetail";

interface LeadDetailViewProps {
  leadId: string;
}

/** Maps the domain's internal `READY` status to the same public vocabulary parents see (see docs/Product/User_Flow.md), for display only. */
function displaySongStatus(status: string): string {
  return status === "READY" ? "COMPLETED" : status;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * The read-only Lead Detail screen (see docs/Product/User_Flow.md):
 * lead information, lyrics history, the approved version, song
 * status/audio/download, generation timestamps, email delivery status,
 * and audit history. There is no editing capability anywhere on this
 * screen.
 */
export function LeadDetailView({ leadId }: LeadDetailViewProps) {
  const { detail, isLoading, notFound, errorMessage } = useLeadDetail(leadId);

  if (isLoading) {
    return <p className="text-body text-muted-foreground">Loading...</p>;
  }

  if (notFound) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        This lead could not be found.
      </p>
    );
  }

  if (errorMessage || !detail) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {errorMessage ?? "Something went wrong."}
      </p>
    );
  }

  const { lead, lyricsHistory, approvedLyrics, song, auditHistory } = detail;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-foreground">Lead Information</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Parent</dt>
            <dd>{lead.parentName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Baby</dt>
            <dd>{lead.babyName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{lead.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{lead.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">City</dt>
            <dd>{lead.city ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{lead.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Registered</dt>
            <dd>{formatTimestamp(lead.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-foreground">Lyrics History</h2>
        {lyricsHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lyrics generated yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lyricsHistory.map((version) => (
              <li key={version.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-muted-foreground">
                  <span>Version {version.version}</span>
                  <span>
                    {version.approved ? "Approved" : (version.rejectionReason ?? "Not approved")}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-foreground">{version.content}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-foreground">Approved Lyrics</h2>
        {approvedLyrics ? (
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
            {approvedLyrics.content}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">No approved lyrics yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-foreground">Song</h2>
        {song ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Status: </span>
              {displaySongStatus(song.status)}
            </p>
            <p>
              <span className="text-muted-foreground">Generated at: </span>
              {formatTimestamp(song.generatedAt)}
            </p>
            <p>
              <span className="text-muted-foreground">Email delivery: </span>
              {song.emailedAt ? `Sent at ${formatTimestamp(song.emailedAt)}` : "Not sent"}
            </p>

            {song.audioUrl ? (
              <>
                <audio controls src={song.audioUrl} className="w-full max-w-sm" />
                {song.duration ? (
                  <p className="text-muted-foreground">Duration: {formatDuration(song.duration)}</p>
                ) : null}
                <a
                  href={song.audioUrl}
                  download
                  className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
                >
                  Download Song
                </a>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No song generated yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-foreground">Audit History</h2>
        {auditHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit entries yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {auditHistory.map((entry) => (
              <li key={entry.id} className="flex justify-between border-b border-border py-1">
                <span>{entry.action}</span>
                <span className="text-muted-foreground">{formatTimestamp(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
