import { type ComponentProps } from "react";
import { Section } from "@/components/layout/Section";
import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  none: "",
  muted: "bg-muted/40",
  soft: "bg-gradient-to-b from-secondary/30 via-transparent to-transparent",
} as const;

interface CampaignSectionProps extends ComponentProps<"section"> {
  tone?: keyof typeof TONE_CLASSES;
}

/**
 * Sprint UI-3A — Landing Experience. Delegates spacing entirely to the
 * existing `Section` primitive ("Do not duplicate layout code"), always
 * at `spacing="xl"` — the brief's "increase whitespace significantly...
 * avoid compact layouts" applied once, here, rather than repeated at
 * every call site. `tone` covers the small set of background
 * treatments the landing page's sections actually use.
 */
export function CampaignSection({ tone = "none", className, ...props }: CampaignSectionProps) {
  return <Section spacing="xl" className={cn(TONE_CLASSES[tone], className)} {...props} />;
}
