import { NextResponse } from "next/server";
import { RateLimiter } from "@/application/security/services/RateLimiter";
import {
  buildShareDestination,
  shareUtmParameters,
  toSharePlatform,
} from "@/application/song/services/shareDestinations";
import { buildSongShareUrl } from "@/application/song/services/songShareUrl";
import { getClientIp } from "@/infrastructure/http/getClientIp";
import { PrismaPublicSongShareGate } from "@/infrastructure/persistence/prisma/song/PrismaPublicSongShareGate";
import { PrismaShareEventRecorder } from "@/infrastructure/persistence/prisma/song/PrismaShareEventRecorder";
import { PrismaRateLimitRepository } from "@/infrastructure/persistence/prisma/security/PrismaRateLimitRepository";
import { logger } from "@/shared/logger/logger";

/**
 * GET /song/share/[shareToken]/to/[platform] — records that a share link
 * was followed, then sends the visitor on to the platform.
 *
 * This is the URL the **parent** clicks in the "song ready" email. The
 * URL that reaches WhatsApp, Facebook or X — and therefore the people
 * they share with — is the song's public page, built by
 * `buildSongShareUrl`. Those two must never swap places: a tracking URL
 * inside a shared message would record an event for every recipient who
 * opened it, and the metric would be measuring its own echo.
 *
 * **No open redirect is possible here.** The destination is never read
 * from the request. `[platform]` is a path segment resolved against a
 * closed set (`toSharePlatform`); anything else is a 404, and the URL is
 * then constructed from that resolved value by `buildShareDestination`.
 * A query parameter naming a destination is ignored, because nothing
 * reads one.
 *
 * **Recording never blocks sharing.** Every failure after the song
 * resolves — the rate limiter, the insert — is caught and the redirect
 * happens anyway. Losing a metric is acceptable; breaking a family's
 * share button is not.
 *
 * **What a recorded event means.** That this endpoint was reached with a
 * valid token and a known platform. Not that the platform published
 * anything, and not necessarily that a person clicked: these links live
 * in email, and mail providers and security scanners follow links to
 * inspect them. The admin UI labels the metric accordingly.
 *
 * Public by design — the token is the credential, the same model as the
 * sibling `/audio` route. `middleware.ts` gates only `/admin` and
 * `/api/admin`.
 */

const shareGate = new PrismaPublicSongShareGate();
const shareEventRecorder = new PrismaShareEventRecorder();
const rateLimiter = new RateLimiter(new PrismaRateLimitRepository());

/**
 * Generous on purpose. This protects the endpoint from being hammered
 * into a write amplifier; it is not a correctness control, and a family
 * legitimately re-sharing must never hit it. Counted per token and IP.
 */
const SHARE_RATE_LIMIT = 30;
const SHARE_RATE_LIMIT_WINDOW_MINUTES = 10;

interface RouteContext {
  params: Promise<{ shareToken: string; platform: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const { shareToken, platform: platformSlug } = await context.params;

  // Resolved before anything touches the database: an unknown platform
  // can never reach a query, a rate-limit key or a redirect.
  const platform = toSharePlatform(platformSlug);
  if (!platform) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let target: { songId: string; leadId: string } | null;
  let song: { babyName: string } | null;

  try {
    [target, song] = await Promise.all([
      shareGate.findShareTargetByToken(shareToken),
      shareGate.findShareableByToken(shareToken),
    ]);
  } catch (error) {
    logger.error("Failed to resolve a share token for tracking", {
      platform,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // One answer for every reason a song is not shareable — unknown token,
  // revoked token, still generating, no audio — so probing reveals
  // nothing.
  if (!target || !song) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const songShareUrl = buildSongShareUrl(shareToken);
  if (!songShareUrl) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const destination = buildShareDestination(platform, songShareUrl, song.babyName);

  // Everything from here on is best-effort. The redirect is already
  // decided and nothing below may prevent it.
  await recordShare({ request, shareToken, platform, target });

  // 302 with `no-store`: the destination embeds the message and must not
  // be cached as this route's permanent answer.
  return NextResponse.redirect(destination, {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
}

async function recordShare(input: {
  request: Request;
  shareToken: string;
  platform: ReturnType<typeof toSharePlatform> & string;
  target: { songId: string; leadId: string };
}): Promise<void> {
  try {
    const allowed = await rateLimiter.consume({
      // The token is part of the scope but never logged; `getClientIp`
      // is the same best-effort source the rest of the app rate-limits
      // on.
      key: `share:${input.shareToken}:${getClientIp(input.request)}`,
      limit: SHARE_RATE_LIMIT,
      windowMinutes: SHARE_RATE_LIMIT_WINDOW_MINUTES,
    });

    if (!allowed.allowed) {
      // Rate limited: skip the write, still redirect. The person sharing
      // is not punished for the endpoint being busy.
      logger.warn("Share tracking rate limit reached; redirecting without recording", {
        platform: input.platform,
      });
      return;
    }

    const utm = shareUtmParameters(input.platform);

    await shareEventRecorder.record({
      songId: input.target.songId,
      leadId: input.target.leadId,
      platform: input.platform,
      utmSource: utm.utmSource,
      utmMedium: utm.utmMedium,
      utmCampaign: utm.utmCampaign,
    });
  } catch (error) {
    // Never the token — it is the credential.
    logger.error("Failed to record a share event; redirecting anyway", {
      platform: input.platform,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
