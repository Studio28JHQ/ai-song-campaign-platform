import { buildAppUrl } from "@/config/app";

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
