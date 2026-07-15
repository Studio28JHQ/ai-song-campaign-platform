import { type ElementType } from "react";
import { cn } from "@/lib/utils";

interface CampaignCardProps {
  /** Larger padding for content-heavy cards (e.g. the registration card). */
  spacious?: boolean;
  /** Renders as a different element (e.g. "li" inside an `<ol>`) — still a plain, non-polymorphic prop, no extra Slot dependency needed for one tag swap. */
  as?: ElementType;
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

/**
 * Sprint UI-3A — Landing Experience. The "premium product card" look
 * used across the landing page (registration card, step cards, FAQ
 * items): 24px radius, soft/diffuse shadow, generous padding. Reused
 * from Sprint UI-2's own card treatment (`rounded-[24px]` +
 * `shadow-[0_8px_30px_rgba(139,92,246,0.08)]`, e.g.
 * `SongResultView.tsx`) rather than inventing a second one.
 */
export function CampaignCard({
  spacious,
  as: Tag = "div",
  className,
  ...props
}: CampaignCardProps) {
  return (
    <Tag
      className={cn(
        "rounded-[24px] border border-border bg-card shadow-[0_8px_30px_rgba(139,92,246,0.08)]",
        spacious ? "p-8 sm:p-10" : "p-6 sm:p-8",
        className,
      )}
      {...props}
    />
  );
}
