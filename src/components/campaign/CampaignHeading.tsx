import { type ComponentProps, type ElementType } from "react";
import { cn } from "@/lib/utils";

const VARIANT_CLASSES = {
  display: "text-display",
  section: "text-heading",
  title: "text-title",
} as const;

type CampaignHeadingVariant = keyof typeof VARIANT_CLASSES;

const VARIANT_FONT: Record<CampaignHeadingVariant, string> = {
  display: "var(--font-display), var(--font-heading)",
  section: "var(--font-section-heading), var(--font-heading)",
  title: "var(--font-section-heading), var(--font-heading)",
};

interface CampaignHeadingProps extends Omit<ComponentProps<"h1">, "className"> {
  as?: ElementType;
  variant?: CampaignHeadingVariant;
  className?: string;
}

/**
 * Sprint UI-3A — Landing Experience. Activates the two UI-2.5 heading
 * fonts for the first time: `display` (Rounded Robin — the Hero's main
 * headline) and `section`/`title` (Gotham Medium — every other
 * heading). Set via inline `style`, not a class, so it wins over
 * `.theme-campaign h1,h2,h3 { font-family: var(--font-heading) }`
 * (Fredoka) regardless of selector specificity — that rule stays
 * exactly as-is for `/generate` and `/song`, out of scope this sprint.
 */
export function CampaignHeading({
  as: Tag = "h2",
  variant = "section",
  className,
  style,
  ...props
}: CampaignHeadingProps) {
  return (
    <Tag
      className={cn(VARIANT_CLASSES[variant], "font-semibold text-foreground", className)}
      style={{ fontFamily: VARIANT_FONT[variant], ...style }}
      {...props}
    />
  );
}
