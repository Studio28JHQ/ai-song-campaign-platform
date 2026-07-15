import Image from "next/image";
import { cn } from "@/lib/utils";

interface CampaignCloudProps {
  className?: string;
  drift?: boolean;
}

/**
 * Sprint UI-3A — Landing Experience. The Sprint UI-2.5 `cloud.svg`
 * illustration, drifting gently. Purely decorative — `alt=""` and
 * `aria-hidden` together remove it from assistive technology.
 */
export function CampaignCloud({ className, drift = true }: CampaignCloudProps) {
  return (
    <Image
      src="/campaign/illustrations/cloud.svg"
      alt=""
      aria-hidden
      width={64}
      height={64}
      className={cn("pointer-events-none select-none", drift && "animate-cloud-drift", className)}
    />
  );
}
