import Image from "next/image";
import { CampaignContainer } from "@/components/campaign/CampaignContainer";
import { CampaignSection } from "@/components/campaign/CampaignSection";

/** Intrinsic size of the source asset — declared so `next/image` can reserve the right aspect ratio and avoid layout shift while it scales fluidly via `w-full h-auto`. */
const BANNER_WIDTH = 1920;
const BANNER_HEIGHT = 1000;

/**
 * The client's campaign banner, between the Hero and the Products
 * section. A single reusable section component, same shape as
 * `CampaignProducts`/`HowItWorks`: its own `CampaignSection` (spacing
 * consistent with every other Landing section) wrapping a
 * `CampaignContainer` (the same max-width every other section uses).
 * `next/image` (not a hand-rolled `<img>`) handles responsive sizing and
 * format/quality optimization automatically; explicit `width`/`height`
 * plus `sizes="100vw"` let it reserve the right aspect ratio up front
 * (no layout shift) while scaling fluidly with the viewport.
 */
export function CampaignBanner() {
  return (
    <CampaignSection>
      <CampaignContainer>
        <Image
          src="/campaign/banners/banner-campaign.jpg"
          alt="Sensyderm Baby — limpia y protege la piel delicada de tu bebé, hipoalergénico y libre de parabenos, preservantes, colorantes y ftalatos"
          width={BANNER_WIDTH}
          height={BANNER_HEIGHT}
          sizes="100vw"
          className="h-auto w-full rounded-[24px]"
        />
      </CampaignContainer>
    </CampaignSection>
  );
}
