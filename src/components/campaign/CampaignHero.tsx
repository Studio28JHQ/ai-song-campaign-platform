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
 * Sprint UI-3A — Landing Experience. The generic Hero shell: a single
 * responsive grid whose item `order` (mobile) and `col-start`/`row-start`
 * (desktop, `lg:`) are set independently per slot, so the two documented
 * layouts — desktop's two columns and mobile's own, differently
 * ordered, single column — come from one markup tree, not two.
 *
 * Desktop: left column = headline → description → form (top to
 * bottom); right column = product → animal.
 * Mobile: animal → headline → description → form → product — the
 * brief's own mobile order, which deliberately does *not* mirror the
 * desktop column grouping (animal appears early, product late), so
 * each slot's mobile position is independent of its desktop one.
 * "Logo" — first in the brief's mobile list — isn't a separate slot
 * here: `Navigation` (rendered immediately above this section, see
 * `app/page.tsx`) already occupies that exact position for every
 * viewport, so the Hero doesn't repeat it.
 *
 * `min-h-[92vh]` — "the Hero should occupy almost the entire first
 * viewport" — stops just short of 100dvh so a hint of the next section
 * is always visible as a scroll affordance.
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
      <CampaignContainer className="relative z-10 py-16 lg:py-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 flex justify-center lg:order-none lg:col-start-2 lg:row-start-1 lg:justify-self-center">
            {animal}
          </div>

          <div className="order-3 text-center lg:order-none lg:col-start-1 lg:row-start-2 lg:text-left">
            {headline}
          </div>

          <div className="order-4 text-center lg:order-none lg:col-start-1 lg:row-start-3 lg:text-left">
            {description}
          </div>

          <div className="order-5 lg:order-none lg:col-start-1 lg:row-start-4">{form}</div>

          <div className="order-6 flex justify-center lg:order-none lg:col-start-2 lg:row-start-2 lg:row-span-2 lg:items-center lg:justify-self-center">
            {product}
          </div>
        </div>
      </CampaignContainer>
    </section>
  );
}
