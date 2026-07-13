import type { Metadata } from "next";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { RegistrationForm } from "@/features/lead/components/RegistrationForm";

export const metadata: Metadata = {
  title: "Register — AI Song Campaign",
  description: "Register to generate a personalized AI song for your baby.",
};

export default function HomePage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <ContentWrapper>
          <div className="flex flex-col items-center gap-6">
            <div
              aria-hidden
              className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground"
            >
              ♪
            </div>

            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-heading font-bold text-foreground">Register for your song</h1>
              <p className="max-w-prose text-body text-muted-foreground">
                Tell us about your family and we&apos;ll create a personalized song for your baby.
              </p>
            </div>

            <div className="w-full max-w-sm">
              <RegistrationForm />
            </div>
          </div>
        </ContentWrapper>
      </Section>
    </PageContainer>
  );
}
