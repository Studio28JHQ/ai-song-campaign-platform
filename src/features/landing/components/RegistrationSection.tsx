import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { Section } from "@/components/layout/Section";
import { RegistrationForm } from "@/features/lead/components/RegistrationForm";

interface RegistrationSectionProps {
  turnstileSiteKey: string;
}

/**
 * Wraps the existing `RegistrationForm` (`src/features/lead/`) — the
 * only registration flow in the application — with the landing page's
 * heading and the `#register` anchor the Hero CTA scrolls to. This
 * component adds no new registration logic of its own.
 */
export function RegistrationSection({ turnstileSiteKey }: RegistrationSectionProps) {
  return (
    <Section id="register" spacing="lg">
      <ContentWrapper>
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="font-heading text-heading font-semibold text-foreground">
              Consigue la canción de tu bebé
            </h2>
            <p className="max-w-prose text-body text-muted-foreground">
              Registrarte toma menos de un minuto — sin necesidad de pago.
            </p>
          </div>

          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <RegistrationForm turnstileSiteKey={turnstileSiteKey} />
          </div>
        </div>
      </ContentWrapper>
    </Section>
  );
}
