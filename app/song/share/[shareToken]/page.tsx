import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSongShareUrl, songShareAudioPath } from "@/application/song/services/songShareUrl";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { appConfig, buildAppUrl } from "@/config/app";
import { PrismaPublicSongShareGate } from "@/infrastructure/persistence/prisma/song/PrismaPublicSongShareGate";

/**
 * The public page behind a song's share link — the one page in this
 * application a stranger is meant to reach.
 *
 * It exists because the alternatives could not be shared: the audio URL
 * is an R2 presigned link carrying `X-Amz-Credential` and expiring in
 * seven days, `/song` is behind a parent session, and `/resume/[token]`
 * *issues* that session. This page shows the least that still makes a
 * share worth opening — the baby's first name, a player, and an
 * invitation to make one — and reveals nothing else about the family.
 *
 * Public by design. `middleware.ts` matches only `/admin` and
 * `/api/admin`, so no session is required or consulted here.
 */

const BANNER_PATH = "/campaign/banners/banner-campaign.jpg";

const shareGate = new PrismaPublicSongShareGate();

interface PageProps {
  params: Promise<{ shareToken: string }>;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/**
 * The reason this page exists at all: WhatsApp, Facebook and X read
 * these tags to build the card that appears in the conversation. Built
 * per song so the card names the child instead of the campaign.
 *
 * `robots: noindex` is deliberate. The link is meant to be passed to
 * people the parent chooses, not collected by a search engine — a
 * crawler that indexed these would turn a private share into a public
 * directory of babies' names. Social scrapers read Open Graph tags
 * directly and are unaffected by it.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareToken } = await params;
  const song = await shareGate.findShareableByToken(shareToken);

  if (!song) {
    return { title: "Canción no disponible", robots: { index: false, follow: false } };
  }

  const title = `Una canción personalizada para ${song.babyName}`;
  const description = "Escucha una canción creada especialmente para este momento.";
  const url = buildSongShareUrl(shareToken) ?? buildAppUrl("/");
  const image = buildAppUrl(BANNER_PATH);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: appConfig.campaign.name,
      title,
      description,
      url,
      locale: "es_ES",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    robots: { index: false, follow: false },
  };
}

export default async function SongSharePage({ params }: PageProps) {
  const { shareToken } = await params;
  const song = await shareGate.findShareableByToken(shareToken);

  // One answer for every reason a song is not shareable — unknown token,
  // revoked token, still generating, no audio — so probing tokens cannot
  // distinguish them.
  if (!song) notFound();

  const duration = formatDuration(song.duration);

  return (
    <div className="theme-campaign min-h-dvh">
      <PageContainer>
        <Section spacing="lg">
          <ContentWrapper>
            <div className="mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <Image
                src={BANNER_PATH}
                alt={`${appConfig.campaign.name} — canciones personalizadas para tu bebé`}
                width={1200}
                height={630}
                priority
                className="h-auto w-full"
              />

              <div className="flex flex-col gap-6 p-6 sm:p-8">
                <div className="flex flex-col gap-2 text-center">
                  <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                    🎵 Una canción personalizada para {song.babyName}
                  </h1>
                  <p className="text-muted-foreground">
                    Creada especialmente para este momento.
                    {duration ? ` Duración: ${duration}.` : ""}
                  </p>
                </div>

                {/*
                  The `src` is this app's own route, never the signed R2
                  URL: the redirect behind it mints a fresh, expiring URL
                  at play time, so no credential is ever rendered here.
                */}
                <audio
                  controls
                  preload="none"
                  className="w-full"
                  src={songShareAudioPath(shareToken)}
                >
                  Tu navegador no puede reproducir audio.{" "}
                  <a href={songShareAudioPath(shareToken)}>Descarga la canción</a>.
                </audio>

                <div className="flex flex-col items-center gap-3 border-t border-border pt-6">
                  <p className="text-center text-sm text-muted-foreground">
                    ¿Quieres una canción para tu bebé?
                  </p>
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                  >
                    🎶 Crea tu propia canción
                  </Link>
                </div>
              </div>
            </div>
          </ContentWrapper>
        </Section>
      </PageContainer>
    </div>
  );
}
