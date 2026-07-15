import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { Section } from "@/components/layout/Section";

/** Explains what the campaign is and why it exists — see docs/Product/Product_Vision.md. */
export function CampaignExplanation() {
  return (
    <Section spacing="lg">
      <ContentWrapper>
        <div className="flex flex-col items-center gap-5 text-center">
          <h2 className="font-heading text-heading font-semibold text-foreground">
            ¿Qué es esta campaña?
          </h2>
          <p className="max-w-prose text-body text-muted-foreground">
            Por tiempo limitado, les damos a las familias la oportunidad de recibir una canción
            completamente original, escrita solo para su bebé. Cuéntanos algunos detalles sobre tu
            pequeño, nuestra IA escribe una letra que capture ese momento y — una vez que la
            apruebes — la convertimos en una canción totalmente producida que podrás conservar para
            siempre.
          </p>
          <p className="max-w-prose text-body text-muted-foreground">
            Sin costo, sin trucos — solo un pequeño regalo para celebrar a tu familia, disponible
            mientras dure la campaña.
          </p>
        </div>
      </ContentWrapper>
    </Section>
  );
}
