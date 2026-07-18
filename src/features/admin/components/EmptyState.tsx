import type { ComponentType } from "react";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}

/**
 * Sprint FINAL-3 — Dashboard Stabilization. A branded empty state —
 * icon in a tinted `primary` badge, Spanish copy — replacing the plain
 * "no hay datos" text previously scattered across every admin list.
 * Reuses existing iconography (`lucide-react`, already used throughout
 * the sidebar and KPI cards) rather than a campaign illustration —
 * those are styled for the public-facing site, not this operational
 * tool.
 */
export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
