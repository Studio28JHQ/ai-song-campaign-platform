import { CampaignAnimal } from "@/components/campaign/CampaignAnimal";
import { CampaignBackground } from "@/components/campaign/CampaignBackground";
import { CampaignBubble } from "@/components/campaign/CampaignBubble";
import { CampaignCard } from "@/components/campaign/CampaignCard";
import { CampaignGlow } from "@/components/campaign/CampaignGlow";
import { CampaignHeading } from "@/components/campaign/CampaignHeading";
import { CampaignHero } from "@/components/campaign/CampaignHero";
import { CampaignProduct } from "@/components/campaign/CampaignProduct";
import { RegistrationForm } from "@/features/lead/components/RegistrationForm";

interface HeroSectionProps {
  turnstileSiteKey: string;
}

/**
 * Sprint UI-3A — Landing Experience; refined in Sprint UI-3B (Hero
 * Polish & UX Refinement). The landing page's real Hero content,
 * composed from the generic `CampaignHero` shell (layout) plus
 * `CampaignBackground`/`CampaignBubble`/`CampaignGlow` (decoration) and
 * `CampaignAnimal`/`CampaignProduct` (Sprint UI-2.5 assets). The
 * registration form is embedded directly here — as its own
 * `CampaignCard` — rather than in a separate scrolled-to section, per
 * the brief's Hero layout; this is the only registration entry point
 * on the page, still the unmodified `RegistrationForm` (no
 * application-flow change, only where and how it's presented).
 *
 * UI-3B removed the cloud illustrations introduced in UI-3A (didn't
 * match the client's reference artwork).
 *
 * UI-3C simplified `CampaignHero` to a plain two-column layout (see
 * that component). Here, the right column stacks the seal above the
 * product (`z-10` on `CampaignAnimal`, a small `-mt-*` pull on
 * `CampaignProduct`) so they read as one composition, seal on top.
 */
export function HeroSection({ turnstileSiteKey }: HeroSectionProps) {
  return (
    <CampaignHero
      background={<CampaignBackground variant="ba-da-ba" />}
      decorations={
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <CampaignGlow className="absolute -top-10 left-1/3 h-96 w-96" />
          <CampaignBubble tone="lavender" size="h-20 w-20" className="absolute top-16 left-[8%]" />
          <CampaignBubble tone="blue" size="h-14 w-14" className="absolute bottom-24 left-[18%]" />
          <CampaignBubble
            tone="purple"
            size="h-24 w-24"
            className="absolute right-[10%] bottom-16"
          />
        </div>
      }
      animal={
        <CampaignAnimal
          variant="seal"
          priority
          className="relative z-10 h-40 w-auto sm:h-52 lg:h-64"
        />
      }
      product={
        <CampaignProduct
          variant="product-infant"
          priority
          className="-mt-6 h-56 w-auto sm:h-72 lg:-mt-10 lg:h-[26rem]"
        />
      }
      headline={
        <CampaignHeading as="h1" variant="display" className="mx-auto max-w-2xl font-bold lg:mx-0">
          Una canción hecha con amor, solo para tu bebé
        </CampaignHeading>
      }
      description={
        <p className="mx-auto mt-5 max-w-md text-body text-muted-foreground lg:mx-0">
          Cuéntanos sobre tu familia y recibe, sin costo, una canción única — escrita e interpretada
          especialmente para tu bebé — directo a tu correo.
        </p>
      }
      form={
        <CampaignCard className="mx-auto mt-8 w-full max-w-md animate-fade-up py-6 sm:py-6 lg:mx-0">
          <CampaignHeading as="h2" variant="title" className="mb-2.5">
            Crea la canción de tu bebé
          </CampaignHeading>
          <RegistrationForm turnstileSiteKey={turnstileSiteKey} />
        </CampaignCard>
      }
    />
  );
}
