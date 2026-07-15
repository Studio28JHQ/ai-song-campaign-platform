import Image from "next/image";
import { CampaignContainer } from "@/components/campaign/CampaignContainer";
import { CampaignHeading } from "@/components/campaign/CampaignHeading";
import { CampaignSection } from "@/components/campaign/CampaignSection";

/** Explains what the campaign is and why it exists — see docs/Product/Product_Vision.md. */
export function CampaignExplanation() {
  return (
    <CampaignSection tone="soft" className="relative overflow-hidden">
      <Image
        src="/campaign/illustrations/heart.svg"
        alt=""
        aria-hidden
        width={56}
        height={56}
        className="pointer-events-none absolute top-8 right-[8%] hidden opacity-70 sm:block"
      />
      <CampaignContainer narrow>
        <div className="flex flex-col items-center gap-6 text-center">
          <CampaignHeading as="h2" variant="section">
            ¿Qué es esta campaña?
          </CampaignHeading>
          <p className="max-w-prose text-body text-muted-foreground">
            Por tiempo limitado, celebramos a las familias con un regalo hecho de ternura: una
            canción completamente original, escrita solo para tu bebé. Cuéntanos algunos detalles
            sobre tu pequeño, nuestra IA escribe una letra que capture ese momento y — una vez que
            la apruebes — la convertimos en una canción totalmente producida que podrás conservar
            para siempre.
          </p>
          <p className="max-w-prose text-body text-muted-foreground">
            Sin costo, sin trucos — solo un pequeño regalo para celebrar a tu familia, disponible
            mientras dure la campaña.
          </p>
        </div>
      </CampaignContainer>
    </CampaignSection>
  );
}
