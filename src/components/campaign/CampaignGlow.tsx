import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface CampaignGlowProps extends ComponentProps<"div"> {
  /** Tailwind size utility, e.g. "h-72 w-72". */
  size?: string;
}

/**
 * Sprint UI-3A — Landing Experience. A large, soft ambient light source
 * behind hero content — the "Light glow" decoration from the brief,
 * CSS-only (see `docs/Design/Asset_Library.md`). Pulses gently via
 * `animate-soft-glow`; purely decorative.
 */
export function CampaignGlow({ size = "h-72 w-72", className, ...props }: CampaignGlowProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none animate-soft-glow rounded-full bg-gradient-to-br from-primary/20 via-accent/25 to-transparent blur-3xl",
        size,
        className,
      )}
      {...props}
    />
  );
}
