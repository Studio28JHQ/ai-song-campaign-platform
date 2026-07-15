import type { Metadata } from "next";
import { Fredoka, Geist, Geist_Mono, Inter } from "next/font/google";
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
    default: `${appName} — Una canción personalizada para tu bebé`,
    template: `%s — ${appName}`,
  },
  description,
  openGraph: {
    type: "website",
    siteName: appName,
    title: `${appName} — Una canción personalizada para tu bebé`,
    description,
    locale: "es_ES",
  },
  twitter: {
    card: "summary",
    title: `${appName} — Una canción personalizada para tu bebé`,
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
        className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} ${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
