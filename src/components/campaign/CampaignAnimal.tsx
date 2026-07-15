import { type ComponentProps } from "react";
import {
  CampaignIllustration,
  type CampaignIllustrationVariant,
} from "@/components/campaign/CampaignIllustration";
import { cn } from "@/lib/utils";

type CampaignAnimalVariant = Extract<CampaignIllustrationVariant, "penguin" | "seal" | "booby">;

interface CampaignAnimalProps extends Omit<ComponentProps<typeof CampaignIllustration>, "variant"> {
  variant: CampaignAnimalVariant;
  float?: boolean;
}

/**
 * Sprint UI-3A — Landing Experience. The Hero's "one main animal" —
 * same floating presentation as `CampaignProduct`, offset slightly
 * slower so the two don't move in lockstep. A thin wrapper over
 * `CampaignIllustration` (UI-2.5); the asset path mapping stays there.
 */
export function CampaignAnimal({
  variant,
  float = true,
  className,
  ...props
}: CampaignAnimalProps) {
  return (
    <CampaignIllustration
      variant={variant}
      className={cn(
        "drop-shadow-[0_16px_28px_rgba(36,59,83,0.18)]",
        float && "animate-float-medium",
        className,
      )}
      {...props}
    />
  );
}
