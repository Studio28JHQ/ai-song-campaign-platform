import { type ReactNode } from "react";
import { CampaignContainer } from "@/components/campaign/CampaignContainer";

interface CampaignHeroProps {
  headline: ReactNode;
  description: ReactNode;
  form: ReactNode;
  product: ReactNode;
  animal: ReactNode;
  background?: ReactNode;
  decorations?: ReactNode;
}

/**
 * Sprint UI-3A — Landing Experience. `min-h-[92vh]` — "the Hero should
 * occupy almost the entire first viewport" — stops just short of
 * 100dvh so a hint of the next section is always visible as a scroll
 * affordance.
 *
 * Sprint UI-3B — Hero Polish. The content block's padding is
 * deliberately top-heavy (`pt-32`/`lg:pt-44` vs. a much smaller bottom
 * padding) rather than symmetric — the section itself still centers
 * that block vertically (`items-center`, unchanged), but a taller top
 * offset reads as the whole composition sitting lower in the viewport,
 * closer to the campaign artwork's own balance.
 *
 * Sprint UI-3C — UX Polish. Replaced the previous per-slot
 * `order`/`col-start`/`row-start` grid (five independently-placed
 * cells) with a plain two-column layout — one `flex-col` per column,
 * each simply stacking its own children top to bottom. Left column:
 * headline → description → form. Right column: animal → product, one
 * composition. Mobile: a single `flex-col` in the same order the JSX
 * already declares (left column's content, then right column's) — no
 * `order-*` needed, since that's already the natural reading order.
 */
export function CampaignHero({
  headline,
  description,
  form,
  product,
  animal,
  background,
  decorations,
}: CampaignHeroProps) {
  return (
    <section className="relative isolate flex min-h-[92vh] items-center overflow-hidden">
      {background}
      {decorations}
      <CampaignContainer className="relative z-10 pt-32 pb-16 lg:pt-44 lg:pb-20">
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16">
          <div className="flex flex-col lg:w-1/2">
            {headline}
            {description}
            {form}
          </div>

          <div className="flex flex-col items-center lg:w-1/2">
            {animal}
            {product}
          </div>
        </div>
      </CampaignContainer>
    </section>
  );
}
