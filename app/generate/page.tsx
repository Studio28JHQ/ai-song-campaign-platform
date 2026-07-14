import type { Metadata } from "next";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { appConfig } from "@/config/app";
import { LyricsWorkflow } from "@/features/lyrics/components/LyricsWorkflow";

export const metadata: Metadata = {
  title: "Review your lyrics — AI Song Campaign",
};

export default function GeneratePage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <ContentWrapper>
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-heading font-bold text-foreground">
                Generate your song&apos;s lyrics
              </h1>
              <p className="max-w-prose text-body text-muted-foreground">
                Tell us a little more and we&apos;ll write personalized lyrics for your baby.
              </p>
            </div>

            <div className="w-full max-w-sm">
              <LyricsWorkflow
                maxAttempts={appConfig.campaign.maxLyricAttempts}
                supportEmail={appConfig.admin.email}
              />
            </div>
          </div>
        </ContentWrapper>
      </Section>
    </PageContainer>
  );
}
