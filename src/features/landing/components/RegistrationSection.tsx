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
            <h2 className="text-heading font-bold text-foreground">Get your baby&apos;s song</h2>
            <p className="max-w-prose text-body text-muted-foreground">
              Registration takes less than a minute — no payment required.
            </p>
          </div>

          <div className="w-full max-w-sm">
            <RegistrationForm turnstileSiteKey={turnstileSiteKey} />
          </div>
        </div>
      </ContentWrapper>
    </Section>
  );
}
