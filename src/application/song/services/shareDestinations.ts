import { appConfig } from "@/config/app";
import type { SharePlatform } from "@/generated/prisma/client";

/**
 * Share Tracking — where each platform's share link actually goes, built
 * here and only here.
 *
 * This module is what makes an open redirect impossible rather than
 * merely unlikely. The tracking route receives a platform *name*, not a
 * URL: it parses that name against `toSharePlatform` below, and if it
 * resolves, this file constructs the destination from the platform and
 * the song's own public URL. There is no code path by which a
 * caller-supplied string becomes a redirect target — a query parameter
 * naming a destination would simply be ignored.
 *
 * The URLs themselves are the ones the email already used, moved here
 * unchanged so the recipient's experience does not shift:
 *
 * - **WhatsApp** carries the message and the link together in `text`,
 *   with no emoji. A real share showed emoji arriving as the
 *   replacement character while accented Spanish came through intact;
 *   our encoding was provably correct, so the fix was to stop depending
 *   on emoji for that channel.
 * - **Facebook** keeps `u` plus `quote`, exactly as today. Whether
 *   Facebook honours `quote` is unresolved and deliberately out of
 *   scope — tracking must not depend on it, and nothing here does.
 * - **X** keeps its emoji message and its `text`/`url` pair, confirmed
 *   working by a real share and left alone.
 *
 * The one rule that matters for correctness: the URL handed to each
 * platform is the song's **public page**, never the tracking URL. If the
 * tracking URL travelled inside a shared message, every recipient who
 * opened it would record another share and the metric would measure its
 * own echo.
 */

/** The URL path segment each platform is addressed by. */
const PLATFORM_SLUGS = {
  whatsapp: "WHATSAPP",
  facebook: "FACEBOOK",
  x: "X",
} as const satisfies Record<string, SharePlatform>;

export type SharePlatformSlug = keyof typeof PLATFORM_SLUGS;

export const SHARE_PLATFORM_SLUGS = Object.keys(PLATFORM_SLUGS) as SharePlatformSlug[];

/**
 * Resolves a URL segment to a platform, or `null` when it names none.
 *
 * Case-insensitive because a mail client may rewrite a URL's case, but
 * otherwise exact: anything that is not one of the three known slugs
 * resolves to `null` and the route answers 404. This is the only way a
 * platform ever enters the system.
 */
export function toSharePlatform(slug: string): SharePlatform | null {
  const normalised = slug.trim().toLowerCase();
  return (PLATFORM_SLUGS as Record<string, SharePlatform | undefined>)[normalised] ?? null;
}

/** The slug for a platform — the inverse of `toSharePlatform`, for building links. */
export function toSharePlatformSlug(platform: SharePlatform): SharePlatformSlug {
  const found = SHARE_PLATFORM_SLUGS.find((slug) => PLATFORM_SLUGS[slug] === platform);
  // Unreachable while `PLATFORM_SLUGS` covers the enum, which
  // `satisfies` enforces at compile time.
  return found ?? "whatsapp";
}

/**
 * The UTM values a share carries. Derived from the validated platform,
 * never from the request: a caller can put whatever it likes in the
 * query string and none of it reaches this.
 */
export const SHARE_UTM_MEDIUM = "social";
export const SHARE_UTM_CAMPAIGN = "family_song";

export function shareUtmParameters(platform: SharePlatform): {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
} {
  return {
    utmSource: toSharePlatformSlug(platform),
    utmMedium: SHARE_UTM_MEDIUM,
    utmCampaign: SHARE_UTM_CAMPAIGN,
  };
}

/** The emoji-free wording WhatsApp and Facebook receive. */
export function plainShareMessage(babyName: string): string {
  return `¡Escucha la canción personalizada que creamos para ${babyName} en ${appConfig.campaign.name}!`;
}

/** The wording X receives — with the emoji a real share confirmed it renders. */
export function emojiShareMessage(babyName: string): string {
  return `🎵 Escucha la canción personalizada que creamos para ${babyName} en ${appConfig.campaign.name} ❤️`;
}

/**
 * The platform URL a tracked click redirects to.
 *
 * `songShareUrl` is the song's public page and is the only URL that ever
 * reaches the platform — see the note above about why the tracking URL
 * must never travel inside a message.
 */
export function buildShareDestination(
  platform: SharePlatform,
  songShareUrl: string,
  babyName: string,
): string {
  const plain = plainShareMessage(babyName);
  const encodedUrl = encodeURIComponent(songShareUrl);

  switch (platform) {
    case "WHATSAPP":
      return `https://wa.me/?text=${encodeURIComponent(`${plain} ${songShareUrl}`)}`;
    case "FACEBOOK":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodeURIComponent(plain)}`;
    case "X":
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(emojiShareMessage(babyName))}&url=${encodedUrl}`;
  }
}
