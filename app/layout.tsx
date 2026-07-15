import type { Metadata } from "next";
import { Fredoka, Geist, Geist_Mono, Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Sprint UI-1 — Spanish Localization & Brand Refresh. A warm, rounded
// display face for public-facing headings only (scoped via
// `.theme-campaign` in globals.css) — the admin panel keeps using
// `--font-sans` for headings, unaffected by this variable existing.
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

// Sprint UI-2 — Campaign Visual Identity. Body face for public-facing
// text (scoped via `.theme-campaign`, same pattern as `fredoka` above)
// — admin keeps `--font-sans` (Geist) for body text, unaffected.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Sprint UI-2.5 — Campaign Asset Library. The client's actual campaign
// typefaces (local OTF files, not Google Fonts), loaded here to expose
// three new CSS variables — `--font-display`, `--font-section-heading`,
// `--font-body-campaign` — for UI-3 to consume. Deliberately NOT wired
// into `.theme-campaign`'s `--font-heading`/`--font-sans` bindings yet:
// this sprint prepares assets only ("no UI redesign yet"), so the live
// theme keeps using Fredoka/Inter (Sprint UI-1/UI-2) until UI-3
// explicitly decides to switch. See docs/Design/Asset_Library.md.
const roundedRobin = localFont({
  src: "../public/campaign/fonts/rounded-robin.otf",
  variable: "--font-display",
  display: "swap",
});

const gothamMedium = localFont({
  src: "../public/campaign/fonts/gotham-medium.otf",
  variable: "--font-section-heading",
  display: "swap",
});

const gothamBook = localFont({
  src: "../public/campaign/fonts/gotham-book.otf",
  variable: "--font-body-campaign",
  display: "swap",
});

// Myriad Pro (`public/campaign/fonts/myriad-pro-regular.otf`) is kept as
// a renamed asset only — no font loader/CSS variable, since nothing in
// the brief calls for it ("Do not use Myriad Pro unless already
// required somewhere else").

// `app/` is exempt from the `no-restricted-properties` ESLint rule that
// forces `src/**` to go through `@/config/env` — reading the two
// NEXT_PUBLIC_ variables directly here is the one place metadata needs
// them, without pulling in the server-only config module.
const appName = process.env.NEXT_PUBLIC_APP_NAME || "AI Song Campaign";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const description =
  "Recibe una canción personalizada creada con IA para tu bebé, totalmente gratis. Regístrate en minutos, aprueba la letra y recibe tu canción única por correo electrónico.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Una canción personalizada para tu bebé | Bassa",
    template: `%s — ${appName}`,
  },
  description,
  openGraph: {
    type: "website",
    siteName: appName,
    title: "Una canción personalizada para tu bebé | Bassa",
    description,
    locale: "es_ES",
  },
  twitter: {
    card: "summary",
    title: "Una canción personalizada para tu bebé | Bassa",
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: appName,
  url: appUrl,
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: appName,
  url: appUrl,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <script
          type="application/ld+json"
          // Fixed, server-defined content only — never user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} ${inter.variable} ${roundedRobin.variable} ${gothamMedium.variable} ${gothamBook.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
