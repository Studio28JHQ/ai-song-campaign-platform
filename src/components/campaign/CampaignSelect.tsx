import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CampaignSelectProps extends React.ComponentProps<"select"> {
  /** An optional leading SVG icon (decorative — the field's own label already names it). */
  icon?: ReactNode;
}

/**
 * `CampaignInput`'s sibling for native `<select>` fields — same
 * campaign-styled sizing, focus ring, and optional leading icon slot, so
 * a Select field reads as part of the same field set as the text inputs
 * around it.
 */
export function CampaignSelect({ icon, className, children, ...props }: CampaignSelectProps) {
  if (!icon) {
    return (
      <select
        className={cn(
          "h-12 w-full rounded-xl border border-input bg-card px-4 text-base outline-none transition-shadow duration-200 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 md:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  }

  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted-foreground"
      >
        {icon}
      </span>
      <select
        className={cn(
          "h-12 w-full rounded-xl border border-input bg-card pr-4 pl-11 text-base outline-none transition-shadow duration-200 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 md:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
