import { type ComponentProps } from "react";
import {
  CampaignIllustration,
  type CampaignIllustrationVariant,
} from "@/components/campaign/CampaignIllustration";
import { cn } from "@/lib/utils";

type CampaignProductVariant = Extract<
  CampaignIllustrationVariant,
  "product-blue" | "product-crema" | "product-infant"
>;

interface CampaignProductProps extends Omit<
  ComponentProps<typeof CampaignIllustration>,
  "variant"
> {
  variant: CampaignProductVariant;
  float?: boolean;
}

/**
 * Sprint UI-3A — Landing Experience. The Hero's product packshot, with
 * the floating + soft-shadow presentation the brief's Hero layout calls
 * for ("Product" as a right-column, semi-floating element on desktop).
 * A thin wrapper over `CampaignIllustration` (UI-2.5) — the asset path
 * mapping itself stays there, never duplicated here.
 */
export function CampaignProduct({
  variant,
  float = true,
  className,
  ...props
}: CampaignProductProps) {
  return (
    <CampaignIllustration
      variant={variant}
      className={cn(
        "drop-shadow-[0_20px_35px_rgba(139,92,246,0.25)]",
        float && "animate-float-slow",
        className,
      )}
      {...props}
    />
  );
}
