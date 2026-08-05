import type { Metadata } from "next";
import { appConfig } from "@/config/app";
import { ConsentBanner } from "@/features/consent/components/ConsentBanner";
import { CampaignProducts } from "@/features/landing/components/CampaignProducts";
import { Faq } from "@/features/landing/components/Faq";
import { GoogleTagManager } from "@/features/landing/components/GoogleTagManager";
import { HeroSection } from "@/features/landing/components/HeroSection";
import { HowItWorks } from "@/features/landing/components/HowItWorks";
import { LandingFooter } from "@/features/landing/components/LandingFooter";
import { LegalDisclaimer } from "@/features/landing/components/LegalDisclaimer";
import { Navigation } from "@/features/landing/components/Navigation";

// `app/` is exempt from the `no-restricted-properties` ESLint rule that
// forces `src/**` to go through `@/config/env` — read directly here,
// same as `app/layout.tsx`.
const appName = process.env.NEXT_PUBLIC_APP_NAME || "AI Song Campaign";
const description =
  "Recibe una canción personalizada creada con IA para tu bebé, totalmente gratis. Regístrate en minutos, aprueba la letra y recibe tu canción única por correo electrónico.";

export const metadata: Metadata = {
  title: "Una canción personalizada para tu bebé | Bassa",
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
    title: "Una canción personalizada para tu bebé | Bassa",
    description,
  },
  twitter: {
    title: "Una canción personalizada para tu bebé | Bassa",
    description,
  },
};

/**
 * The public campaign Landing Page — Sprint UI-3A rebuilt this into a
 * marketing landing experience: a minimal `Navigation` (logo only), a
 * full-viewport `HeroSection` with the registration form embedded
 * directly inside it (reusing the existing `RegistrationForm` — see
 * `src/features/lead/`, not duplicated), then campaign products, how it
 * works, FAQ, legal disclaimer, and footer (see
 * docs/Product/User_Flow.md). There is no separate scrolled-to
 * registration section anymore — the Hero *is* the registration entry
 * point. Entirely Server Components: the only client-side island is
 * `RegistrationForm` itself.
 *
 * The former `CampaignExplanation` text section ("¿Qué es esta
 * campaña?") was removed outright, not just hidden — `CampaignProducts`
 * (previously nested at its bottom) is now its own top-level section
 * directly under `HeroSection`, and `CampaignExplanation` itself was
 * deleted since nothing else referenced it. A new campaign banner
 * section belongs between `HeroSection` and `CampaignProducts` — deferred
 * until the client's banner asset is available.
 *
 * `.theme-campaign` (Sprint UI-1) scopes the soft-blue/white/purple
 * brand palette to this page only; `.campaign-landing` (Sprint UI-3A)
 * additionally activates Gotham Book as the body font — both scoped to
 * this page alone, see `app/globals.css`.
 *
 * `GoogleTagManager` (Feature 1) and `ConsentBanner` (Feature 2) are the
 * only other client-side islands, alongside `RegistrationForm` — both
 * fetch their own state independently and never block this page's own
 * render.
 */
export default function HomePage() {
  return (
    <>
      <GoogleTagManager />
      <main className="theme-campaign campaign-landing">
        <Navigation />
        <HeroSection turnstileSiteKey={appConfig.security.turnstile.siteKey} />
        <CampaignProducts />
        <HowItWorks />
        <Faq />
        <LegalDisclaimer />
        <LandingFooter campaignName={appName} />
      </main>
      <ConsentBanner />
    </>
  );
}
