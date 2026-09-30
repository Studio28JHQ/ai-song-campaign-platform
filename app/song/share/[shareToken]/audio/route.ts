import { NextResponse } from "next/server";
import { PrismaPublicSongShareGate } from "@/infrastructure/persistence/prisma/song/PrismaPublicSongShareGate";
import { R2AudioUrlResolver } from "@/infrastructure/storage/R2AudioUrlResolver";
import { logger } from "@/shared/logger/logger";

/**
 * GET /song/share/[shareToken]/audio — plays the song behind a public
 * share token.
 *
 * This route exists so the signed R2 URL never reaches the public page's
 * HTML. The page renders `<audio src=".../audio">`; the browser follows
 * it at play time and this handler answers with a 302 to a URL minted
 * right then. The credential therefore lives in one redirect, for one
 * listener, and expires — instead of sitting in the source of a page
 * that anyone on Facebook can view.
 *
 * Reuses the existing `R2AudioUrlResolver` rather than proxying the
 * bytes: streaming the audio through a Vercel Function would put the
 * whole file through the invocation for every play, and the bucket stays
 * private either way.
 *
 * Public by design — the token is the credential, the same model as
 * `/resume/[token]`. Not matched by `middleware.ts`, which gates only
 * `/admin` and `/api/admin`. An unknown, revoked, unfinished or
 * audio-less song answers 404 identically, so probing tokens reveals
 * nothing.
 */

const shareGate = new PrismaPublicSongShareGate();
const audioUrlResolver = new R2AudioUrlResolver();

interface RouteContext {
  params: Promise<{ shareToken: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { shareToken } = await context.params;

  try {
    const song = await shareGate.findShareableByToken(shareToken);

    if (!song) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const audioUrl = await audioUrlResolver.resolve(song.audioStorageKey);

    // 302, not 301: the target is a short-lived signed URL and must
    // never be cached as this route's permanent answer. `no-store` says
    // the same thing to any intermediary that ignores the status code.
    return NextResponse.redirect(audioUrl, {
      status: 302,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    // Never the token and never the storage key — this line can reach a
    // log aggregator, and the token is what grants access.
    logger.error("Failed to resolve public share audio", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
