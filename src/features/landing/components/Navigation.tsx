import Image from "next/image";
import { CampaignContainer } from "@/components/campaign/CampaignContainer";

/**
 * Sprint UI-3A — Landing Experience. Logo only, no links, no menu —
 * "Minimal. No technical navigation." This is a marketing landing page,
 * not an application shell with routes to jump between.
 */
export function Navigation() {
  return (
    <header className="relative z-20 py-6">
      <CampaignContainer className="flex justify-center sm:justify-start">
        <Image
          src="/campaign/logo/bassa-logo-color.svg"
          alt="Bassa"
          width={140}
          height={43}
          priority
        />
      </CampaignContainer>
    </header>
  );
}
