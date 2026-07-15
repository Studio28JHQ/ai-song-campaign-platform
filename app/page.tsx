import type { Metadata } from "next";
import { appConfig } from "@/config/app";
import { CampaignExplanation } from "@/features/landing/components/CampaignExplanation";
import { Faq } from "@/features/landing/components/Faq";
import { HeroSection } from "@/features/landing/components/HeroSection";
import { HowItWorks } from "@/features/landing/components/HowItWorks";
import { LandingFooter } from "@/features/landing/components/LandingFooter";
import { LegalDisclaimer } from "@/features/landing/components/LegalDisclaimer";
import { RegistrationSection } from "@/features/landing/components/RegistrationSection";

// `app/` is exempt from the `no-restricted-properties` ESLint rule that
// forces `src/**` to go through `@/config/env` — read directly here,
// same as `app/layout.tsx`.
const appName = process.env.NEXT_PUBLIC_APP_NAME || "AI Song Campaign";
const description =
  "Recibe una canción personalizada creada con IA para tu bebé, totalmente gratis. Regístrate en minutos, aprueba la letra y recibe tu canción única por correo electrónico.";

export const metadata: Metadata = {
  title: `${appName} — Una canción personalizada para tu bebé`,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
    title: `${appName} — Una canción personalizada para tu bebé`,
    description,
  },
  twitter: {
    title: `${appName} — Una canción personalizada para tu bebé`,
    description,
  },
};

/**
 * The public campaign Landing Page — Hero, campaign explanation, how it
 * works, registration (reusing the existing `RegistrationForm` — see
 * `src/features/lead/`, not duplicated here), FAQ, legal disclaimer, and
 * footer (see docs/Product/User_Flow.md). Entirely Server Components:
 * the only client-side island is `RegistrationForm` itself.
 *
 * `.theme-campaign` (Sprint UI-1) scopes the soft-blue/white/purple
 * brand palette to this page only — see `app/globals.css`.
 */
export default function HomePage() {
  return (
    <main className="theme-campaign">
      <HeroSection />
      <CampaignExplanation />
      <HowItWorks />
      <RegistrationSection turnstileSiteKey={appConfig.security.turnstile.siteKey} />
      <Faq />
      <LegalDisclaimer />
      <LandingFooter campaignName={appName} />
    </main>
  );
}
