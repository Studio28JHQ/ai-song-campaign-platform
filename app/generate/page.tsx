import type { Metadata } from "next";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";

export const metadata: Metadata = {
  title: "Generating your song — AI Song Campaign",
};

/** Temporary placeholder — the generation flow is implemented in a later task. */
export default function GeneratePage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <ContentWrapper>
          <p className="text-center text-body text-muted-foreground">
            Generation module coming next.
          </p>
        </ContentWrapper>
      </Section>
    </PageContainer>
  );
}
