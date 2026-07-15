import Image, { type ImageProps } from "next/image";

/**
 * Sprint UI-2.5 — Campaign Asset Library. The single source of truth
 * for where each campaign photo actually lives on disk — no other file
 * should ever hardcode a `/campaign/animals/...` or
 * `/campaign/products/...` path; they should render a
 * `<CampaignIllustration variant="..." />` instead. Adding, moving, or
 * renaming an asset only ever requires a change here.
 *
 * `src` always points at the PNG master, not the pre-generated `.webp`
 * sibling (see `scripts/optimize-campaign-assets.mjs`) — `next/image`
 * runs its own format negotiation from the highest-quality source at
 * request time, so handing it an already-lossy `.webp` would only
 * throw away quality it could otherwise keep. The static `.webp` files
 * remain available on disk for non-`next/image` consumers (CSS
 * backgrounds, emails, plain `<img>`).
 *
 * Width/height are the PNG masters' real pixel dimensions (never
 * upscaled) — required by `next/image` to reserve layout space and
 * avoid CLS; callers scale down via `className`/`style`/`sizes`, never
 * by requesting a different intrinsic size.
 */
export type CampaignIllustrationVariant =
  "penguin" | "seal" | "booby" | "product-blue" | "product-crema" | "product-infant";

interface CampaignAsset {
  src: string;
  width: number;
  height: number;
  alt: string;
}

const CAMPAIGN_ASSETS: Record<CampaignIllustrationVariant, CampaignAsset> = {
  penguin: {
    src: "/campaign/animals/pinguino.png",
    width: 660,
    height: 800,
    alt: "Pingüino ilustrado de la campaña",
  },
  seal: {
    src: "/campaign/animals/foca.png",
    width: 851,
    height: 800,
    alt: "Foca ilustrada de la campaña",
  },
  booby: {
    src: "/campaign/animals/piquero.png",
    width: 653,
    height: 800,
    alt: "Piquero ilustrado de la campaña",
  },
  "product-blue": {
    src: "/campaign/products/packshot-sensyderm.png",
    width: 748,
    height: 800,
    alt: "Empaque del producto Sensyderm",
  },
  "product-crema": {
    src: "/campaign/products/packshot-sensyderm-crema.png",
    width: 573,
    height: 800,
    alt: "Empaque del producto Sensyderm Crema",
  },
  "product-infant": {
    src: "/campaign/products/sensy-derm-infant.png",
    width: 419,
    height: 800,
    alt: "Empaque del producto Sensyderm Infant",
  },
};

interface CampaignIllustrationProps extends Omit<ImageProps, "src" | "width" | "height" | "alt"> {
  variant: CampaignIllustrationVariant;
  /** Overrides the variant's default (Spanish) alt text. */
  alt?: string;
}

export function CampaignIllustration({ variant, alt, ...imageProps }: CampaignIllustrationProps) {
  const asset = CAMPAIGN_ASSETS[variant];

  return (
    <Image
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={alt ?? asset.alt}
      {...imageProps}
    />
  );
}
