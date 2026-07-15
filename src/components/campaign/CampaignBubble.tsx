import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  purple: "bg-primary/25",
  blue: "bg-accent/30",
  lavender: "bg-secondary/60",
} as const;

interface CampaignBubbleProps extends ComponentProps<"div"> {
  tone?: keyof typeof TONE_CLASSES;
  /** Tailwind size utility, e.g. "h-16 w-16". */
  size?: string;
  drift?: boolean;
}

/**
 * Sprint UI-3A — Landing Experience. A floating soft blob/bubble — the
 * CSS-only decoration documented in `docs/Design/Asset_Library.md`
 * ("Floating bubbles" row), not a shipped image asset, so it can flex
 * to any size/position/color the layout needs. Purely decorative;
 * callers position it with `className` (`absolute -top-6 -left-8`, …).
 */
export function CampaignBubble({
  tone = "purple",
  size = "h-16 w-16",
  drift = true,
  className,
  ...props
}: CampaignBubbleProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none rounded-full blur-2xl",
        TONE_CLASSES[tone],
        size,
        drift && "animate-bubble-drift",
        className,
      )}
      {...props}
    />
  );
}
