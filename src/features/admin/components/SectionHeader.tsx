import type { ComponentType } from "react";

/**
 * Sprint FINAL-3 — Dashboard Stabilization. A consistent card header —
 * icon in a tinted badge + title — reused by every Dashboard and Lead
 * Detail section ("consistent card headers").
 */
export function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <h2 className="text-title font-semibold text-foreground">{title}</h2>
    </div>
  );
}
