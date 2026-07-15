import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { Section } from "@/components/layout/Section";

/** Required campaign disclosures — see docs/Product/Product_Vision.md (one-month, capped, temporary campaign). */
export function LegalDisclaimer() {
  return (
    <Section spacing="sm">
      <ContentWrapper>
        <p className="text-caption text-muted-foreground">
          Esta es una campaña promocional por tiempo limitado y no representa un producto o servicio
          continuo. Las canciones se generan con ayuda de inteligencia artificial a partir de la
          información que proporcionas; el contenido se revisa automáticamente antes de la
          generación. Hay una canción disponible por correo electrónico, mientras dure la capacidad
          de la campaña. Al registrarte, aceptas ser contactado en el correo electrónico
          proporcionado únicamente para la entrega de tu canción personalizada.
        </p>
      </ContentWrapper>
    </Section>
  );
}
