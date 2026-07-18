interface LyricsContentProps {
  content: string;
}

// Sprint v1.3 — AI Songwriting Quality. Claude's official structure now
// starts every lyrics version with a `[Intro]` section label, not a
// title line — a bracketed label like `[Intro]` or `[Verse 1]` is never
// a title, so it must fall back to the generic label below rather than
// being displayed as one. Lyrics versions created before this sprint
// still start with an actual title line and continue to display it
// exactly as before — this check doesn't require knowing which sprint a
// given version was generated under.
const SECTION_LABEL_PATTERN = /^\[.+\]$/;

function hasTitleLine(firstLine: string | undefined): boolean {
  const trimmed = firstLine?.trim() ?? "";
  return trimmed.length > 0 && !SECTION_LABEL_PATTERN.test(trimmed);
}

function extractTitle(firstLine: string | undefined): string {
  return hasTitleLine(firstLine) ? (firstLine as string).trim() : "Tu canción";
}

/**
 * Read-only presentation of a lyrics version — never editable. Renders
 * the first line as the title and every other line as a stanza paragraph,
 * preserving line breaks, using semantic markup suited to song lyrics
 * rather than a raw `<textarea>`/`<pre>` block. Shared by the
 * pre-approval review panel and the post-approval locked view so both
 * present lyrics identically.
 */
export function LyricsContent({ content }: LyricsContentProps) {
  const [firstLine, ...bodyLines] = content.split("\n");
  const title = extractTitle(firstLine);
  const body = (hasTitleLine(firstLine) ? bodyLines.join("\n") : content).trim();

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-gradient-to-b from-secondary/50 to-secondary/20 p-6">
      <h2 className="font-heading text-title font-semibold text-foreground">{title}</h2>
      <p className="whitespace-pre-line text-body leading-loose text-foreground">{body}</p>
    </article>
  );
}
