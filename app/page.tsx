import type { Metadata } from "next";
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
  "Get a free, personalized AI-generated song for your baby. Register in minutes, approve the lyrics, and receive your one-of-a-kind song by email.";

export const metadata: Metadata = {
  title: `${appName} — A personalized song for your baby`,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
    title: `${appName} — A personalized song for your baby`,
    description,
  },
  twitter: {
    title: `${appName} — A personalized song for your baby`,
    description,
  },
};

/**
 * The public campaign Landing Page — Hero, campaign explanation, how it
 * works, registration (reusing the existing `RegistrationForm` — see
 * `src/features/lead/`, not duplicated here), FAQ, legal disclaimer, and
 * footer (see docs/Product/User_Flow.md). Entirely Server Components:
 * the only client-side island is `RegistrationForm` itself.
 */
export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <CampaignExplanation />
      <HowItWorks />
      <RegistrationSection />
      <Faq />
      <LegalDisclaimer />
      <LandingFooter campaignName={appName} />
    </main>
  );
}
