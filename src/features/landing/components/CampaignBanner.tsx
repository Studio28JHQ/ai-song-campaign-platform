import Image from "next/image";

/** Intrinsic size of the source asset — declared so `next/image` can reserve the right aspect ratio and avoid layout shift while it scales fluidly via `w-full h-auto`. */
const BANNER_WIDTH = 1920;
const BANNER_HEIGHT = 1000;

/**
 * The client's campaign banner — now the very first thing on the page,
 * full-bleed above `HeroSection`. Deliberately not built on
 * `CampaignSection`/`CampaignContainer` (every other Landing section's
 * shared shell): those add the page's max-width, horizontal margins, and
 * card treatment, which is exactly what a flush, edge-to-edge banner
 * must not have. `next/image` still handles the responsive
 * sizing/format optimization; explicit `width`/`height` plus
 * `sizes="100vw"` reserve the correct aspect ratio up front (no layout
 * shift) while it scales fluidly with the viewport. `priority` because
 * this is now the page's first visible element (and likely LCP
 * candidate) — the one exception to the rest of the Landing's images,
 * which stay lazy.
 */
export function CampaignBanner() {
  return (
    <Image
      src="/campaign/banners/banner-campaign.jpg"
      alt="Sensyderm Baby — limpia y protege la piel delicada de tu bebé, hipoalergénico y libre de parabenos, preservantes, colorantes y ftalatos"
      width={BANNER_WIDTH}
      height={BANNER_HEIGHT}
      sizes="100vw"
      priority
      className="block h-auto w-full"
    />
  );
}
