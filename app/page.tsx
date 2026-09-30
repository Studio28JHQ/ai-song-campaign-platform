import type { Metadata } from "next";
import { appConfig } from "@/config/app";
import { ConsentBanner } from "@/features/consent/components/ConsentBanner";
import { CampaignBanner } from "@/features/landing/components/CampaignBanner";
import { CampaignProducts } from "@/features/landing/components/CampaignProducts";
import { Faq } from "@/features/landing/components/Faq";
import { GoogleTagManager } from "@/features/landing/components/GoogleTagManager";
import { HeroSection } from "@/features/landing/components/HeroSection";
import { HowItWorks } from "@/features/landing/components/HowItWorks";
import { LandingFooter } from "@/features/landing/components/LandingFooter";
import { LegalDisclaimer } from "@/features/landing/components/LegalDisclaimer";

// `app/` is exempt from the `no-restricted-properties` ESLint rule that
// forces `src/**` to go through `@/config/env` — read directly here,
// same as `app/layout.tsx`.
const appName = process.env.NEXT_PUBLIC_APP_NAME || "Mi primera canción";
const description =
  "Recibe una canción personalizada creada con IA para tu bebé, totalmente gratis. Regístrate en minutos, aprueba la letra y recibe tu canción única por correo electrónico.";

/**
 * The campaign banner, reused as this page's social card — the same
 * asset the emails already use (`emailChrome.bannerUrl`), so the link
 * preview and the inbox show the same artwork. Dimensions are the
 * file's real ones (1920×1000, a 1.92:1 ratio, which is what Facebook
 * and X want for a large card).
 *
 * The path stays relative on purpose. `metadataBase` in `app/layout.tsx`
 * resolves it to an absolute `https://` URL in the rendered tag, which
 * is what the scrapers require, while keeping the domain declared once
 * instead of hardcoded here — the same treatment `canonical` and
 * `openGraph.url` above already get.
 */
const OG_IMAGE = {
  url: "/campaign/banners/banner-campaign.jpg",
  width: 1920,
  height: 1000,
  alt: "Mi primera canción — una canción personalizada para tu bebé",
  type: "image/jpeg",
};

/**
 * Note that this `openGraph` block *replaces* the one in
 * `app/layout.tsx` rather than merging with it — Next.js overwrites
 * nested metadata objects instead of deep-merging them. That is why
 * `type` is repeated here: without it the landing rendered no
 * `og:type` at all, even though the layout declares one.
 */
export const metadata: Metadata = {
  title: "Una canción personalizada para tu bebé | Bassa",
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "Una canción personalizada para tu bebé | Bassa",
    description,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Una canción personalizada para tu bebé | Bassa",
    description,
    images: [OG_IMAGE],
  },
};

/**
 * The public campaign Landing Page — Sprint UI-3A rebuilt this into a
 * marketing landing experience: a full-viewport `HeroSection` with the
 * registration form embedded directly inside it (reusing the existing
 * `RegistrationForm` — see `src/features/lead/`, not duplicated), then
 * campaign products, how it works, FAQ, legal disclaimer, and footer
 * (see docs/Product/User_Flow.md). There is no separate scrolled-to
 * registration section anymore — the Hero *is* the registration entry
 * point. Entirely Server Components: the only client-side island is
 * `RegistrationForm` itself.
 *
 * The former `CampaignExplanation` text section ("¿Qué es esta
 * campaña?") was removed outright, not just hidden — `CampaignProducts`
 * (previously nested at its bottom) is now its own top-level section
 * directly under `HeroSection`, and `CampaignExplanation` itself was
 * deleted since nothing else referenced it.
 *
 * `CampaignBanner` (the client's own campaign artwork) is now the very
 * first thing on the page, full-bleed above `HeroSection` — the
 * previous logo-only `Navigation` header was removed outright (not
 * hidden) so nothing sits above the banner; `Navigation` itself still
 * exists and is unchanged for `/generate`/`/song`, just no longer
 * rendered here.
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
        <CampaignBanner />
        <HowItWorks />
        <HeroSection turnstileSiteKey={appConfig.security.turnstile.siteKey} />
        <CampaignProducts />
        <Faq />
        <LegalDisclaimer />
        <LandingFooter campaignName={appName} />
      </main>
      <ConsentBanner />
    </>
  );
}
