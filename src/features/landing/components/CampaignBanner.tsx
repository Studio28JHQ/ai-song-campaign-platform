/** Intrinsic size of the source asset — declared so the `<video>` can reserve the right aspect ratio via `width`/`height` and avoid layout shift while it scales fluidly via `w-full h-auto`. */
const BANNER_WIDTH = 1920;
const BANNER_HEIGHT = 1000;

/**
 * The client's campaign banner — now the very first thing on the page,
 * full-bleed above `HeroSection`. Deliberately not built on
 * `CampaignSection`/`CampaignContainer` (every other Landing section's
 * shared shell): those add the page's max-width, horizontal margins, and
 * card treatment, which is exactly what a flush, edge-to-edge banner
 * must not have. Renders the campaign's motion asset instead of the
 * former static JPG; explicit `width`/`height` reserve the same
 * aspect ratio up front (no layout shift) while it scales fluidly with
 * the viewport via `w-full h-auto`, exactly like the image it replaces.
 * Autoplays muted and looped, with no controls, as ambient background
 * motion rather than user-operable media — so it's hidden from
 * assistive technology.
 */
export function CampaignBanner() {
  return (
    <video
      src="/campaign/banners/banner-campaign.mp4"
      width={BANNER_WIDTH}
      height={BANNER_HEIGHT}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden="true"
      className="block h-auto w-full"
    />
  );
}
