import { NextResponse } from "next/server";
import { GenerationDispatcher } from "@/application/song/use-cases/GenerationDispatcher";
import { GenerationPoller } from "@/application/song/use-cases/GenerationPoller";
import { getClientIp } from "@/infrastructure/http/getClientIp";
import { verifyInternalSecret } from "@/infrastructure/http/verifyInternalSecret";
import { ResendEmailService } from "@/infrastructure/email/ResendEmailService";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaCampaignGate } from "@/infrastructure/persistence/prisma/song/PrismaCampaignGate";
import { PrismaEmailDeliveryTracker } from "@/infrastructure/persistence/prisma/song/PrismaEmailDeliveryTracker";
import { PrismaMoodSunoPromptProvider } from "@/infrastructure/persistence/prisma/song/PrismaMoodSunoPromptProvider";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { HttpAudioDownloader } from "@/infrastructure/storage/HttpAudioDownloader";
import { CloudflareR2Storage } from "@/infrastructure/storage/CloudflareR2Storage";
import { R2AudioUrlResolver } from "@/infrastructure/storage/R2AudioUrlResolver";
import { MurekaSongService } from "@/infrastructure/mureka/MurekaSongService";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/internal/pipeline/run — RC-2 Production Hardening: the
 * scheduler-facing endpoint that closes the gap left by the pipeline
 * previously only ever advancing inside an `after()` callback of a
 * user-facing request (`POST /api/lyrics/approve`,
 * `POST /api/song/generate`, `POST /api/admin/songs/[songId]/retry`).
 * Meant to be invoked on a fixed schedule by an external scheduler,
 * independent of whether any user traffic is happening at all — this
 * route has no opinion on what that scheduler is (see "External
 * Scheduler" in `docs/Architecture/System_Architecture.md`); it is
 * currently a GitHub Actions workflow
 * (`.github/workflows/song-pipeline.yml`, replacing an earlier Vercel
 * Cron job that Vercel's Hobby plan doesn't support at this frequency).
 *
 * Internal-only: never reachable without the shared `CRON_SECRET` (see
 * `verifyInternalSecret`) — there is no public execution path. Unlike
 * the request-triggered call sites above, this one runs
 * `GenerationDispatcher`/`GenerationPoller` directly (not backgrounded
 * via `after()`): there is no user response to return quickly, so the
 * whole point of this endpoint is to actually do the work and report
 * what happened — including surfacing a genuine failure as a non-2xx
 * status so the scheduler's own run can be flagged as failed, rather
 * than always answering 200 the way the backgrounded call sites do.
 *
 * Runs each use case exactly once per invocation — no looping, no
 * draining, no self-rescheduling. A single-invocation self-reschedule
 * via `after()` + an in-process delay was tried and reverted: that
 * pattern depends on the serverless instance staying alive for the
 * length of the delay after the response is already sent, which this
 * app's production serverless execution model does not reliably
 * guarantee — the callback was silently cut short, so a submitted song
 * only ever advanced one step per invocation and then stalled until
 * some unrelated request happened to call this endpoint again. The
 * scheduled GitHub Actions workflow
 * (`.github/workflows/song-pipeline.yml`, every 10 minutes) is the only
 * periodic mechanism that keeps a song progressing to a terminal state
 * without depending on user traffic. Request-triggered call sites
 * (`triggerPipelineTick`, from `/api/lyrics/approve`,
 * `/api/song/generate`, `/api/admin/songs/[songId]/retry`) may still
 * call this endpoint once for responsiveness — immediately advancing
 * the queue when a real user is already there — but nothing about
 * generation completion ever depends on that happening.
 * `GenerationDispatcher` itself also reclaims a Song stuck `GENERATING`
 * past `GENERATION_TIMEOUT_MINUTES` at the start of this same call
 * (RC-2 — see `GenerationDispatcher`), so a stalled queue self-heals on
 * the next tick without any manual intervention.
 */

const songRepository = new PrismaSongRepository();
const lyricsRepository = new PrismaLyricsRepository();
const leadRepository = new PrismaLeadRepository();
const moodProvider = new PrismaMoodSunoPromptProvider();
const songGenerator = new MurekaSongService();
const emailSender = new ResendEmailService();
const emailDeliveryTracker = new PrismaEmailDeliveryTracker();
const campaignGate = new PrismaCampaignGate();

const generationDispatcher = new GenerationDispatcher(
  songRepository,
  lyricsRepository,
  moodProvider,
  songGenerator,
);

const generationPoller = new GenerationPoller(
  songRepository,
  songGenerator,
  new HttpAudioDownloader(),
  new CloudflareR2Storage(),
  new R2AudioUrlResolver(),
  leadRepository,
  emailSender,
  emailDeliveryTracker,
  campaignGate,
);

export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyInternalSecret(request)) {
    logger.error("Pipeline tick: rejected an unauthenticated request", {
      ip: getClientIp(request),
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const dispatcherResult = await generationDispatcher.execute();
    const pollerResult = await generationPoller.execute();

    return NextResponse.json(
      {
        dispatcher: dispatcherResult ? { songId: dispatcherResult.song.id } : null,
        poller: pollerResult
          ? { songId: pollerResult.song.id, outcome: pollerResult.outcome }
          : null,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Pipeline tick failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "pipeline_tick_failed" }, { status: 500 });
  }
}
