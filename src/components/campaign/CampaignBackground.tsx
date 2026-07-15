import { cn } from "@/lib/utils";

export type CampaignBackgroundVariant = "ba-da-ba" | "gu-gu-ga" | "plup-pup";

interface CampaignBackgroundProps {
  variant?: CampaignBackgroundVariant;
  className?: string;
}

/**
 * Sprint UI-3A — Landing Experience. The Hero's layered background:
 * one of the Sprint UI-2.5 photo backgrounds (AVIF preferred, WEBP
 * fallback), washed with the same exact 3-stop gradient introduced in
 * Sprint UI-2 (`#F8FCFF → #D9F2FF → #BEE8FF`) so the photo reads as a
 * soft, pastel layer rather than a busy photograph. Purely decorative
 * (`aria-hidden`) — parent must be `position: relative`.
 *
 * `image-set()` isn't declared via a single inline `style` object
 * (a later duplicate key would just silently win, not progressively
 * enhance) — instead two stacked layers give the same effect through
 * the DOM: a plain WEBP layer underneath, and an `image-set()` layer on
 * top that only paints over it in browsers that understand the
 * function, leaving the WEBP layer as the fallback everywhere else.
 *
 * Sprint UI-3B — Hero Polish: the gradient wash on top was lightened
 * (`opacity-80` → `opacity-45`) and the photo layers brightened
 * (`opacity-50` → `opacity-70`) — the client's reference art shows the
 * baby photo clearly, not mostly hidden under an off-white gradient.
 */
export function CampaignBackground({ variant = "ba-da-ba", className }: CampaignBackgroundProps) {
  const base = `/campaign/backgrounds/background-${variant}`;

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10", className)}>
      <div
        className="absolute inset-0 bg-cover bg-center opacity-70"
        style={{ backgroundImage: `url(${base}.webp)` }}
      />
      <div
        className="absolute inset-0 bg-cover bg-center opacity-70"
        style={{
          backgroundImage: `image-set(url(${base}.avif) type("image/avif"), url(${base}.webp) type("image/webp"))`,
        }}
      />
      {/* Wash, not cover: partial opacity so the photo layers above stay
          visible underneath, blending into a single soft, pastel scene. */}
      <div
        className="absolute inset-0 opacity-45"
        style={{ background: "linear-gradient(180deg, #F8FCFF 0%, #D9F2FF 55%, #BEE8FF 100%)" }}
      />
    </div>
  );
}
