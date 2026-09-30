import { buildAppUrl } from "@/config/app";
import type { SharePlatform } from "@/generated/prisma/client";
import { shareUtmParameters, toSharePlatformSlug } from "./shareDestinations";

/**
 * Social Sharing — where a song's public page lives, defined once.
 *
 * Both send paths (`SongCompletionService` for the automatic email,
 * `ResendSongEmailUseCase` for the admin resend) and the page's own
 * `og:url` build the same URL from here, so the route can never be
 * spelled two ways — and `SongReadyEmailTemplate` receives a finished
 * URL and stays ignorant of tokens entirely.
 *
 * `buildAppUrl` is the app's single source for the public origin
 * (`NEXT_PUBLIC_APP_URL`), which in Production is
 * `https://miprimeracancion.bassa.com.ec`. The absolute form is required:
 * these URLs are posted to WhatsApp, Facebook and X, and used as
 * `og:url`, none of which can resolve a relative path.
 */
const SHARE_PATH_PREFIX = "/song/share";

/** The public share URL for a song, or `null` when it has no token and therefore no public page. */
export function buildSongShareUrl(publicShareToken: string | null): string | null {
  if (!publicShareToken) return null;
  return buildAppUrl(`${SHARE_PATH_PREFIX}/${encodeURIComponent(publicShareToken)}`);
}

/** The route the public page's `<audio>` element plays from. Relative on purpose — it is same-origin. */
export function songShareAudioPath(publicShareToken: string): string {
  return `${SHARE_PATH_PREFIX}/${encodeURIComponent(publicShareToken)}/audio`;
}

/**
 * Share Tracking — the URL a share button in the email points at.
 *
 * This is what the *parent* clicks. It records the click and redirects to
 * the platform; the URL that reaches the platform, and therefore the
 * recipient, is `buildSongShareUrl` above. The two must never be
 * swapped: a tracking URL inside a shared message would record an event
 * for every recipient who opened it.
 *
 * The UTM parameters are here so the link is self-describing in any
 * external analytics the campaign runs. They are generated from the
 * platform, and the route re-derives them from the platform it validated
 * rather than reading them back — a link with hand-edited UTMs stores
 * the honest values, not the edited ones.
 */
export function buildSongShareTrackingUrl(
  publicShareToken: string | null,
  platform: SharePlatform,
): string | null {
  if (!publicShareToken) return null;

  const slug = toSharePlatformSlug(platform);
  const { utmSource, utmMedium, utmCampaign } = shareUtmParameters(platform);
  const query = new URLSearchParams({
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
  });

  return buildAppUrl(
    `${SHARE_PATH_PREFIX}/${encodeURIComponent(publicShareToken)}/to/${slug}?${query.toString()}`,
  );
}

/**
 * Share Tracking — everything the "song ready" email needs in order to
 * render its share row, built in one place so the two send paths
 * (`SongCompletionService` and `ResendSongEmailUseCase`) cannot drift.
 *
 * `shareUrl` is the song's public page: shown as the copyable link, and
 * the URL the platforms eventually receive. `tracking` are the URLs the
 * parent's buttons point at. Returns `null` for a song with no public
 * page, which the template renders as no share section at all.
 */
export interface SongShareLinks {
  shareUrl: string;
  tracking: { whatsapp: string; facebook: string; x: string };
}

export function buildSongShareLinks(publicShareToken: string | null): SongShareLinks | null {
  const shareUrl = buildSongShareUrl(publicShareToken);
  if (!shareUrl || !publicShareToken) return null;

  const whatsapp = buildSongShareTrackingUrl(publicShareToken, "WHATSAPP");
  const facebook = buildSongShareTrackingUrl(publicShareToken, "FACEBOOK");
  const x = buildSongShareTrackingUrl(publicShareToken, "X");

  if (!whatsapp || !facebook || !x) return null;

  return { shareUrl, tracking: { whatsapp, facebook, x } };
}
