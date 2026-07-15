import { type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VARIANT_CLASSES = {
  primary:
    "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-[var(--primary-hover)]",
  secondary: "border-2 border-primary bg-card text-primary hover:bg-secondary",
  ghost: "bg-transparent text-primary hover:bg-secondary/60 shadow-none",
} as const;

export type CampaignButtonVariant = keyof typeof VARIANT_CLASSES;

interface CampaignButtonProps extends Omit<ComponentProps<typeof Button>, "variant"> {
  variant?: CampaignButtonVariant;
}

/**
 * Sprint UI-3A — Landing Experience. The campaign's three button
 * looks — Primary/Secondary/Ghost — built on top of the shared
 * `Button` (`src/components/ui/`, also used by admin) rather than a
 * fresh implementation, so hover/focus/disabled states, keyboard
 * behavior, and the underlying `<button>` semantics are never
 * duplicated. Only the visual variant classes are campaign-specific;
 * `outline`/`aria-invalid`/etc. styling that admin depends on is
 * untouched, since none of it is overridden here.
 */
export function CampaignButton({ variant = "primary", className, ...props }: CampaignButtonProps) {
  return (
    <Button
      className={cn(
        "h-12 rounded-full px-8 text-base font-semibold",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
