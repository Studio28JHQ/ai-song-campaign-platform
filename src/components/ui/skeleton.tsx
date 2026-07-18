import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Sprint FINAL-3 — Dashboard Stabilization. The standard shadcn/ui
 * skeleton primitive — a plain `animate-pulse` block using only the
 * existing `bg-muted` token, so it matches whatever theme scope it
 * renders inside (admin's default palette or `.theme-campaign`).
 * Callers size it (`className`) to match the shape of the content it's
 * standing in for, so loading never shifts the layout once real data
 * arrives.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
