interface LyricsContentProps {
  content: string;
}

function extractTitle(content: string): string {
  const [firstLine] = content.split("\n");
  return firstLine?.trim() || "Tu canción";
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
  const [, ...bodyLines] = content.split("\n");
  const title = extractTitle(content);
  const body = bodyLines.join("\n").trim();

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-gradient-to-b from-secondary/50 to-secondary/20 p-6">
      <h2 className="font-heading text-title font-semibold text-foreground">{title}</h2>
      <p className="whitespace-pre-line text-body leading-loose text-foreground">{body}</p>
    </article>
  );
}
