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
            Por tiempo limitado, queremos celebrar a las familias con un regalo muy especial: una
            canción completamente original, escrita e interpretada exclusivamente para tu bebé.
            Cuéntanos un poco sobre tu pequeño y nuestra inteligencia artificial creará una letra
            inspirada en su historia. Cuando la apruebes, la convertiremos en una canción totalmente
            producida para que puedas conservarla y recordarla siempre.
          </p>
          <p className="max-w-prose text-body text-muted-foreground">
            Es un regalo sin costo, creado con mucho cariño para tu familia y disponible únicamente
            durante el tiempo que dure esta campaña.
          </p>
        </div>
      </CampaignContainer>
    </CampaignSection>
  );
}
