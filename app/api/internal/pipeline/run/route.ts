import { NextResponse, after } from "next/server";
import { GenerationDispatcher } from "@/application/song/use-cases/GenerationDispatcher";
import { GenerationPoller } from "@/application/song/use-cases/GenerationPoller";
import { getClientIp } from "@/infrastructure/http/getClientIp";
import { triggerPipelineTick } from "@/infrastructure/http/triggerPipelineTick";
import { verifyInternalSecret } from "@/infrastructure/http/verifyInternalSecret";
import { sleep } from "@/shared/utils";
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
 * Runs each use case exactly once per invocation — no in-request
 * looping or draining. Self-perpetuating instead: if this tick either
 * dispatched a song or polled one (i.e. there is still something
 * `GENERATING`, or something was just claimed off the queue), it
 * schedules exactly one more tick after a short delay via `after()` —
 * a self-call through `triggerPipelineTick`, the same helper every
 * request-triggered call site uses to kick the pipeline off in the
 * first place. This is what makes a submitted song keep progressing to
 * a terminal state on its own, without depending on another user,
 * another song generation, or the external scheduler's next run. The
 * chain naturally stops the moment a tick finds nothing left to do
 * (queue empty and nothing `GENERATING`) — see `shouldKeepTicking`.
 * `GenerationDispatcher` itself also reclaims a Song stuck `GENERATING`
 * past `GENERATION_TIMEOUT_MINUTES` at the start of this same call
 * (RC-2 — see `GenerationDispatcher`), so a stalled queue self-heals
 * on the next tick without any manual intervention.
 *
 * The external scheduler (`.github/workflows/song-pipeline.yml`) still
 * calls this same endpoint every 10 minutes — now purely a safety net
 * that resumes the chain if it was ever interrupted (e.g. a deploy
 * restarting the process mid-chain), not the primary way the pipeline
 * advances.
 */
const PIPELINE_TICK_INTERVAL_MS = 5_000;

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

    if (shouldKeepTicking(dispatcherResult, pollerResult)) {
      const origin = new URL(request.url).origin;
      after(async () => {
        await sleep(PIPELINE_TICK_INTERVAL_MS);
        await triggerPipelineTick(origin);
      });
    }

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

/**
 * Whether another tick is worth scheduling: true the moment this tick
 * actually touched a song — either the dispatcher just claimed one off
 * the queue (it will need polling next), or the poller found one to
 * poll at all (still `pending`, or just turned terminal and the queue
 * may have another one waiting). False only when both found nothing —
 * queue empty and nothing `GENERATING` — which is the chain's natural,
 * self-terminating stop condition.
 */
function shouldKeepTicking(
  dispatcherResult: Awaited<ReturnType<GenerationDispatcher["execute"]>>,
  pollerResult: Awaited<ReturnType<GenerationPoller["execute"]>>,
): boolean {
  return dispatcherResult !== null || pollerResult !== null;
}
