import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// `app/` is exempt from the `no-restricted-properties` ESLint rule that
// forces `src/**` to go through `@/config/env` — reading the two
// NEXT_PUBLIC_ variables directly here is the one place metadata needs
// them, without pulling in the server-only config module.
const appName = process.env.NEXT_PUBLIC_APP_NAME || "AI Song Campaign";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const description =
  "Get a free, personalized AI-generated song for your baby. Register in minutes, approve the lyrics, and receive your one-of-a-kind song by email.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${appName} — A personalized song for your baby`,
    template: `%s — ${appName}`,
  },
  description,
  openGraph: {
    type: "website",
    siteName: appName,
    title: `${appName} — A personalized song for your baby`,
    description,
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: `${appName} — A personalized song for your baby`,
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
    <html lang="en">
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
