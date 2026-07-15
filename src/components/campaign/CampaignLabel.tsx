import { type ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Sprint UI-3A — Landing Experience. Thin campaign-styled wrapper over
 * the shared `Label` — larger, warmer type, otherwise identical
 * behavior (still a real `<label htmlFor>`, still accessible).
 */
export function CampaignLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return <Label className={cn("text-body font-semibold text-foreground", className)} {...props} />;
}
