import { type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CampaignInputProps extends React.ComponentProps<typeof Input> {
  /** An optional leading SVG icon (decorative — the field's own label already names it). */
  icon?: ReactNode;
}

/**
 * Sprint UI-3A — Landing Experience. Thin campaign-styled wrapper over
 * the shared `Input` — large click area, soft animated focus ring, and
 * an optional leading icon slot. Every prop (including form-library
 * `register()` spread props) passes straight through to the same
 * underlying `<input>`, so nothing about field behavior changes.
 */
export function CampaignInput({ icon, className, ...props }: CampaignInputProps) {
  if (!icon) {
    return (
      <Input
        className={cn(
          "h-12 rounded-xl border-input bg-card px-4 transition-shadow duration-200 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20",
          className,
        )}
        {...props}
      />
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
      <Input
        className={cn(
          "h-12 rounded-xl border-input bg-card pr-4 pl-11 transition-shadow duration-200 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20",
          className,
        )}
        {...props}
      />
    </div>
  );
}
