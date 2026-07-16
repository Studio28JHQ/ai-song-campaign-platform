import type { Metadata } from "next";
import { CampaignBackground } from "@/components/campaign/CampaignBackground";
import { CampaignBubble } from "@/components/campaign/CampaignBubble";
import { CampaignGlow } from "@/components/campaign/CampaignGlow";
import { CampaignHeading } from "@/components/campaign/CampaignHeading";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { appConfig } from "@/config/app";
import { LandingFooter } from "@/features/landing/components/LandingFooter";
import { Navigation } from "@/features/landing/components/Navigation";
import { LyricsWorkflow } from "@/features/lyrics/components/LyricsWorkflow";

// `app/` is exempt from the `no-restricted-properties` ESLint rule that
// forces `src/**` to go through `@/config/env` — same pattern already
// used in `app/layout.tsx`/`app/page.tsx`.
const appName = process.env.NEXT_PUBLIC_APP_NAME || "AI Song Campaign";

export const metadata: Metadata = {
  title: "Revisa la letra de tu canción — AI Song Campaign",
};

/**
 * Sprint UI-3C — UX Polish. Reuses the landing's visual identity
 * instead of a bare, second look: `.campaign-landing` activates the
 * same campaign typography as the landing (on top of `.theme-campaign`,
 * already here since Sprint UI-1), `Navigation`/`LandingFooter` are the
 * same header/footer, and `CampaignBackground`/`CampaignGlow`/
 * `CampaignBubble` are the exact same background + decorations the
 * Hero uses — no new component, all four already existed.
 */
export default function GeneratePage() {
  return (
    <div className="theme-campaign campaign-landing relative flex min-h-dvh flex-col overflow-hidden">
      <CampaignBackground variant="ba-da-ba" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <CampaignGlow className="absolute -top-10 left-1/3 h-96 w-96" />
        <CampaignBubble tone="lavender" size="h-20 w-20" className="absolute top-24 left-[6%]" />
        <CampaignBubble tone="blue" size="h-14 w-14" className="absolute right-[10%] bottom-24" />
      </div>

      <Navigation />

      <PageContainer className="relative z-10 flex-1">
        <Section spacing="lg">
          <ContentWrapper>
            <div className="flex flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <CampaignHeading as="h2" variant="section">
                  Crea la letra de la canción de tu bebé
                </CampaignHeading>
                <p className="max-w-prose text-body text-muted-foreground">
                  Cuéntanos un poco más y escribiremos una letra personalizada para tu bebé.
                </p>
              </div>

              {/*
                Sprint UI-3C — widened from `max-w-sm` (384px) to
                `max-w-3xl` (768px, inside the requested 700–820px
                desktop range) so the lyrics text itself has room to
                breathe; `w-full` already keeps it at 100% on mobile,
                no separate override needed.
              */}
              <div className="w-full max-w-3xl rounded-[24px] border border-border bg-card shadow-[0_8px_30px_rgba(139,92,246,0.08)] p-6 sm:p-8">
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

      <LandingFooter campaignName={appName} />
    </div>
  );
}
