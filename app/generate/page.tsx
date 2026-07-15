import type { Metadata } from "next";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { appConfig } from "@/config/app";
import { LyricsWorkflow } from "@/features/lyrics/components/LyricsWorkflow";

export const metadata: Metadata = {
  title: "Revisa la letra de tu canción — AI Song Campaign",
};

export default function GeneratePage() {
  return (
    <div className="theme-campaign min-h-dvh">
      <PageContainer>
        <Section spacing="lg">
          <ContentWrapper>
            <div className="flex flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="font-heading text-heading font-semibold text-foreground">
                  Crea la letra de la canción de tu bebé
                </h1>
                <p className="max-w-prose text-body text-muted-foreground">
                  Cuéntanos un poco más y escribiremos una letra personalizada para tu bebé.
                </p>
              </div>

              <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <LyricsWorkflow
                  maxAttempts={appConfig.campaign.maxLyricAttempts}
                  supportEmail={appConfig.admin.email}
                  turnstileSiteKey={appConfig.security.turnstile.siteKey}
                />
              </div>
            </div>
          </ContentWrapper>
        </Section>
      </PageContainer>
    </div>
  );
}
