import Image from "next/image";
import { CampaignContainer } from "@/components/campaign/CampaignContainer";

/**
 * Sprint UI-3A — Landing Experience. Logo only, no links, no menu —
 * "Minimal. No technical navigation." This is a marketing landing page,
 * not an application shell with routes to jump between.
 *
 * Sprint UI-3B — Hero Polish: logo enlarged ~37% (140×43 → 192×59,
 * same 3.25:1 aspect ratio) for more visual presence.
 */
export function Navigation() {
  return (
    <header className="relative z-20 py-6">
      <CampaignContainer className="flex justify-center sm:justify-start">
        <Image
          src="/campaign/logo/bassa-logo-color.svg"
          alt="Bassa"
          width={192}
          height={59}
          priority
        />
      </CampaignContainer>
    </header>
  );
}
